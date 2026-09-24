import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Prisma } from "@/lib/db"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"
import { slugifyPlatform } from "@/lib/platforms"

export const dynamic = "force-dynamic"

const platformSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  _count: { select: { games: true } },
} as const

export async function GET(request: Request) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return NextResponse.json(
      { error: guard.status === 403 ? "forbidden" : "unauthorized" },
      { status: guard.status },
    )
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "admin",
      limit: 240,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  const platforms = await prisma.platform.findMany({
    orderBy: { name: "asc" },
    select: platformSelect,
  })

  return NextResponse.json({ platforms })
}

export async function POST(request: Request) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return NextResponse.json(
      { error: guard.status === 403 ? "forbidden" : "unauthorized" },
      { status: guard.status },
    )
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "admin",
      limit: 240,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { name?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const name = String(body.name ?? "").trim().slice(0, 100)
  if (!name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  try {
    const platform = await prisma.platform.create({
      data: { name, slug: slugifyPlatform(name) },
      select: platformSelect,
    })
    return NextResponse.json({ platform }, { status: 201 })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "name_in_use" }, { status: 409 })
    }
    console.error("[admin/platforms] error creando plataforma:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}