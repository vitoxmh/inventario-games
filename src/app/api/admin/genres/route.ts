import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Prisma } from "@/lib/db"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"
import { normalizeGenre } from "@/lib/genres"

export const dynamic = "force-dynamic"

const genreSelect = {
  id: true,
  slug: true,
  nameEs: true,
  nameEn: true,
  sortOrder: true,
  createdAt: true,
  _count: { select: { games: true } },
} as const

/**
 * Normaliza un género de la lista. Devuelve `null` cuando el nombre queda vacío,
 * que es el único error de validación posible: el `slug` se deriva de ahí y los
 * nombres sí admiten acentos, que `normalizeGenre` quita solo para el slug.
 */
function readName(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null
  return value.trim().slice(0, limit) || null
}

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

  const genres = await prisma.genre.findMany({
    orderBy: { sortOrder: "asc" },
    select: genreSelect,
  })

  return NextResponse.json({ genres })
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

  let body: { nameEs?: unknown; nameEn?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const nameEs = readName(body.nameEs, 100)
  const nameEn = readName(body.nameEn, 100)
  if (!nameEs || !nameEn) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  // El `slug` sale del nombre español porque es el idioma de quien da de alta el
  // género. Si luego se renombra, se conserva el `slug` que ya tenía: es la
  // clave estable y no debe dar saltos por un cambio de nombre.
  const slug = normalizeGenre(nameEs).replace(/ +/g, "-") || "genero"

  try {
    const last = await prisma.genre.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    })

    const genre = await prisma.genre.create({
      data: { slug, nameEs, nameEn, sortOrder: (last?.sortOrder ?? -1) + 1 },
      select: genreSelect,
    })
    return NextResponse.json({ genre }, { status: 201 })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "name_in_use" }, { status: 409 })
    }
    console.error("[admin/genres] error creando género:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}
