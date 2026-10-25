import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { MAX_RELEASE_YEAR, MIN_RELEASE_YEAR } from "@/lib/kinds"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/** Teclas capturadas en la barra superior, para la lista de resultados. */
const MAX_RESULTS = 8
const MIN_QUERY_LENGTH = 2

/**
 * Búsqueda global sobre los juegos del propio usuario.
 *
 * Es deliberadamente distinta de `/api/games` (que devuelve la colección
 * entera) y de `/api/rawg/search` (que busca en el catálogo público): la
 * barra superior filtra lo que el usuario ya tiene, así que siempre acotado a
 * `userId` y sin querying de nada ajeno.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "games-search",
      limit: 240,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] })
  }

  // `contains` con `mode: "insensitive"` cubre título, plataforma, género,
  // créditos, serie y año, que es el mismo criterio que aplica el filtro de la
  // colección, y así el buscador encuentra "Fire Emblem" tanto por el título
  // como por la desarrolladora sin pedirle al usuario que separe campos.
  //
  // El género se busca por los dos nombres del listado con `some`, que es la
  // forma de bajar por una relación many-to-many: el juego aparece si alguno de
  // sus géneros encaja, no hace falta que coincidan todos.
  const year = Number(q)
  const isYear =
    Number.isInteger(year) &&
    year >= MIN_RELEASE_YEAR &&
    year <= MAX_RELEASE_YEAR
  const games = await prisma.game.findMany({
    where: {
      userId: session.user.id,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        ...(isYear ? [{ releaseYear: year }] : []),
        {
          genres: {
            some: {
              genre: {
                OR: [
                  { nameEs: { contains: q, mode: "insensitive" } },
                  { nameEn: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
        },
        { developer: { contains: q, mode: "insensitive" } },
        { publisher: { contains: q, mode: "insensitive" } },
        { series: { contains: q, mode: "insensitive" } },
        {
          platform: {
            is: { name: { contains: q, mode: "insensitive" } },
          },
        },
      ],
    },
    orderBy: { title: "asc" },
    take: MAX_RESULTS,
    select: {
      id: true,
      title: true,
      kind: true,
      coverImageUrl: true,
      status: true,
      rating: true,
      platform: { select: { name: true } },
      images: { select: { url: true }, take: 1 },
    },
  })

  const results = games.map((game) => ({
    id: game.id,
    title: game.title,
    kind: game.kind,
    coverImageUrl: game.images[0]?.url ?? game.coverImageUrl,
    status: game.status,
    rating: game.rating,
    platform: game.platform?.name ?? null,
  }))

  return NextResponse.json({ results })
}
