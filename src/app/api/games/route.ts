import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma, CollectionKind, GameStatus } from "@/lib/db"
import { getPlanLimit } from "@/lib/plans"
import { fetchRawgGameCredits } from "@/lib/rawg"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"
import { genreIdFromLabel, readGenreIds } from "@/lib/genre-input"
import { flatGenres } from "@/lib/game-summary"
import {
  isCollectionKind,
  isValidReleaseYear,
  kindRequiresPlatform,
} from "@/lib/kinds"
import { isValidImageUrl } from "@/lib/image-url"

export const dynamic = "force-dynamic"

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session
}

const MAX_CREDIT_LENGTH = 160

/**
 * Normaliza un texto corto del cuerpo (developer, publisher o series): cadena
 * recortada y con límite de longitud, o `null` si no viene nada.
 */
function readShortText(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.trim().slice(0, MAX_CREDIT_LENGTH) || null
}

const createSelect = {
  id: true,
  title: true,
  kind: true,
  platformId: true,
  platform: { select: { name: true } },
  genres: {
    select: {
      genre: { select: { id: true, slug: true, nameEs: true, nameEn: true } },
    },
  },
  developer: true,
  publisher: true,
  series: true,
  volume: true,
  releaseYear: true,
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
    kind?: unknown
    platformId?: unknown
    genreIds?: unknown
    genre?: unknown
    developer?: unknown
    publisher?: unknown
    series?: unknown
    volume?: unknown
    releaseYear?: unknown
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

  // El tipo es una allowlist del enum; sin `typeof` un array de un elemento
  // colaría (`String(["BOOK"]) === "BOOK"`). Sin tipo se asume juego, que es lo
  // que era todo antes de esta feature.
  let kind: CollectionKind = CollectionKind.GAME
  if (body.kind !== undefined && body.kind !== null && body.kind !== "") {
    if (!isCollectionKind(body.kind)) {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 })
    }
    kind = body.kind
  }

  // La plataforma es obligatoria solo en juegos. En el resto es opcional y, si
  // llega, tiene que existir en el catálogo del admin.
  const platformId = String(body.platformId ?? "").trim().slice(0, 100)

  if (!title) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }
  if (kindRequiresPlatform(kind) && !platformId) {
    return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
  }

  if (platformId) {
    const platform = await prisma.platform.findUnique({
      where: { id: platformId },
      select: { id: true },
    })
    if (!platform) {
      return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
    }
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

  // RAWG solo describe videojuegos: en el resto de tipos se ignora el id del
  // catálogo (y con él la precarga de créditos y el tiempo jugado).
  const rawgId =
    kind === CollectionKind.GAME &&
    (typeof body.rawgId === "string" || typeof body.rawgId === "number")
      ? String(body.rawgId).slice(0, 40)
      : undefined

  const playtimeMin =
    kind === CollectionKind.GAME &&
    typeof body.playtimeMin === "number" &&
    body.playtimeMin >= 0
      ? Math.floor(body.playtimeMin)
      : undefined

  const coverImageUrl =
    typeof body.coverImageUrl === "string"
      ? body.coverImageUrl.trim().slice(0, 1000)
      : ""
  if (coverImageUrl !== "" && !isValidImageUrl(coverImageUrl)) {
    return NextResponse.json({ error: "invalid_image_url" }, { status: 400 })
  }

  const developer = readShortText(body.developer)
  const publisher = readShortText(body.publisher)
  // Serie/línea y tomo. Son opcionales en todos los tipos, así que un valor
  // ausente o vacío se guarda como `null`; lo que llegue se valida aquí y no se
  // confía en el recorte del cliente.
  const series = readShortText(body.series)
  let volume: number | null = null
  if (body.volume !== undefined && body.volume !== null && body.volume !== "") {
    if (typeof body.volume !== "number" && typeof body.volume !== "string") {
      return NextResponse.json({ error: "invalid_volume" }, { status: 400 })
    }
    const parsed = Number(body.volume)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99999) {
      return NextResponse.json({ error: "invalid_volume" }, { status: 400 })
    }
    volume = parsed
  }

  // El año de lanzamiento lo usa la consola, pero la API solo valida el dato:
  // qué tipos lo pintan lo decide `kindSupportsReleaseYear`. Igual que el tomo,
  // un valor vacío se guarda como `null` y un tipo equivocado se rechaza antes
  // de tocar la BD.
  let releaseYear: number | null = null
  if (
    body.releaseYear !== undefined &&
    body.releaseYear !== null &&
    body.releaseYear !== ""
  ) {
    if (
      typeof body.releaseYear !== "number" &&
      typeof body.releaseYear !== "string"
    ) {
      return NextResponse.json(
        { error: "invalid_release_year" },
        { status: 400 },
      )
    }
    const parsed = Number(body.releaseYear)
    if (!isValidReleaseYear(parsed)) {
      return NextResponse.json(
        { error: "invalid_release_year" },
        { status: 400 },
      )
    }
    releaseYear = parsed
  }

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
        kind,
        platformId: platformId || null,
        genres: {
          create: genreIds.map((genreId) => ({ genreId })),
        },
        developer: credits.developer,
        publisher: credits.publisher,
        series,
        volume,
        releaseYear,
        rating,
        ...(status ? { status } : {}),
        coverImageUrl: coverImageUrl || null,
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