import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlanLimit } from "@/lib/plans"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session
}

const createSelect = {
  id: true,
  title: true,
  platformId: true,
  platform: { select: { name: true } },
  genre: true,
  status: true,
  condition: true,
  coverImageUrl: true,
  rawgId: true,
  playtimeMin: true,
  purchasePrice: true,
  purchaseDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET() {
  const session = await requireUser()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const [user, games] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
    prisma.game.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: createSelect,
    }),
  ])

  const plan = user?.plan ?? "FREE"
  const limit = await getPlanLimit(plan)

  return NextResponse.json({ games, plan, limit, count: games.length })
}

export async function POST(request: Request) {
  const session = await requireUser()
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "games",
      limit: 120,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: {
    rawgId?: unknown
    title?: unknown
    platformId?: unknown
    genre?: unknown
    coverImageUrl?: unknown
    playtimeMin?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const title = String(body.title ?? "").trim().slice(0, 200)
  const platformId = String(body.platformId ?? "").trim().slice(0, 100)

  if (!title || !platformId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  const platform = await prisma.platform.findUnique({
    where: { id: platformId },
    select: { id: true },
  })
  if (!platform) {
    return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
  }

  // El límite se evalúa contra el plan actual en BD (autoritativo), no
  // contra el snapshot del JWT: un plan expirado se refleja de inmediato.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  })
  const plan = dbUser?.plan ?? "FREE"
  const limit = await getPlanLimit(plan)

  if (limit !== null) {
    const count = await prisma.game.count({
      where: { userId: session.user.id },
    })
    if (count >= limit) {
      return NextResponse.json({ error: "plan_limit" }, { status: 403 })
    }
  }

  const rawgId =
    typeof body.rawgId === "string" || typeof body.rawgId === "number"
      ? String(body.rawgId).slice(0, 40)
      : undefined

  const playtimeMin =
    typeof body.playtimeMin === "number" && body.playtimeMin >= 0
      ? Math.floor(body.playtimeMin)
      : undefined

  try {
    const game = await prisma.game.create({
      data: {
        userId: session.user.id,
        title,
        platformId,
        genre:
          typeof body.genre === "string" ? body.genre.trim().slice(0, 120) : null,
        coverImageUrl:
          typeof body.coverImageUrl === "string"
            ? body.coverImageUrl.slice(0, 1000)
            : null,
        rawgId,
        playtimeMin,
      },
      select: createSelect,
    })
    return NextResponse.json({ game }, { status: 201 })
  } catch (error) {
    console.error("[games] error creando juego:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}