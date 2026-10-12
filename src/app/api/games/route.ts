import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma, GameStatus } from "@/lib/db"
import { getPlanLimit } from "@/lib/plans"
import { fetchRawgGameCredits } from "@/lib/rawg"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"
import { genreIdFromLabel, readGenreIds } from "@/lib/genre-input"
import { flatGenres } from "@/lib/game-summary"

export const dynamic = "force-dynamic"

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session
}

const MAX_CREDIT_LENGTH = 160

/**
 * Normaliza un crédito (developer / publisher) que viene del cuerpo: cadena
 * recortada y con límite de longitud, o `null` si no viene nada.
 */
function readCredit(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.trim().slice(0, MAX_CREDIT_LENGTH) || null
}

const createSelect = {
  id: true,
  title: true,
  platformId: true,
  platform: { select: { name: true } },
  genres: {
    select: {
      genre: { select: { id: true, slug: true, nameEs: true, nameEn: true } },
    },
  },
  developer: true,
  publisher: true,
  rating: true,
  status: true,
  condition: true,
  parts: true,
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

  return NextResponse.json({
    games: games.map((game) => ({ ...game, ...flatGenres(game) })),
    plan,
    limit,
    count: games.length,
  })
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
    genreIds?: unknown
    genre?: unknown
    developer?: unknown
    publisher?: unknown
    rating?: unknown
    status?: unknown
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

  const developer = readCredit(body.developer)
  const publisher = readCredit(body.publisher)

  // El género llega dos caminos: elegido del listado (`genreIds`, los que marcó
  // el usuario) o deduplicado del texto que trae RAWG. El cuerpo manda por
  // encima, igual que con los créditos: si el cliente ya envió `genreIds`, no se
  // pisa con lo del catálogo.
  const rawGenreLabel =
    typeof body.genre === "string" ? body.genre.trim().slice(0, 120) : ""
  const requested = await readGenreIds(body.genreIds)
  if (!requested.ok) {
    return NextResponse.json({ error: requested.error }, { status: 400 })
  }
  let genreIds = requested.genreIds
  if (genreIds.length === 0 && rawGenreLabel) {
    const fromCatalog = await genreIdFromLabel(rawGenreLabel)
    if (fromCatalog) genreIds = [fromCatalog]
  }

  let rating: number | null = null
  if (body.rating !== undefined && body.rating !== null && body.rating !== "") {
    const parsed = Number(body.rating)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      return NextResponse.json({ error: "invalid_rating" }, { status: 400 })
    }
    rating = parsed
  }

  // El estado es una de las allowlist del enum, nunca un string libre. Sin el
  // `typeof` un array de un elemento colaría como válido
  // (`String(["WISHLIST"]) === "WISHLIST"`). Si no viene, se queda el
  // `@default(OWNED)` del schema (mismo comportamiento que antes de que el alta
  // manual pudiera elegirlo).
  let status: GameStatus | undefined
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    if (typeof body.status !== "string" || !(body.status in GameStatus)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }
    status = body.status as GameStatus
  }

  // Al añadir desde el catálogo de RAWG, los créditos se precargan con lo que
  // devuelve la API. El cuerpo manda por encima: si el cliente ya los envió (o
  // el usuario los escribió a mano), no se pisa ese dato con el de RAWG.
  let credits: { developer: string | null; publisher: string | null } = {
    developer,
    publisher,
  }
  if (rawgId && !developer && !publisher) {
    const rawgIdNumber = Number(rawgId)
    if (Number.isInteger(rawgIdNumber)) {
      credits = await fetchRawgGameCredits(rawgIdNumber)
    }
  }

  try {
    const game = await prisma.game.create({
      data: {
        userId: session.user.id,
        title,
        platformId,
        genres: {
          create: genreIds.map((genreId) => ({ genreId })),
        },
        developer: credits.developer,
        publisher: credits.publisher,
        rating,
        ...(status ? { status } : {}),
        coverImageUrl:
          typeof body.coverImageUrl === "string"
            ? body.coverImageUrl.slice(0, 1000)
            : null,
        rawgId,
        playtimeMin,
      },
      select: createSelect,
    })
    return NextResponse.json({ game: { ...game, ...flatGenres(game) } }, { status: 201 })
  } catch (error) {
    console.error("[games] error creando juego:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}