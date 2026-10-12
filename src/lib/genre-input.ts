import { prisma } from "@/lib/db"
import { matchGenreSlug } from "@/lib/genres"

/**
 * Tope de géneros por juego. No es un límite de la BD (que no lo tiene) sino de
 * la interfaz: más de seis no cabe en el desplegable ni sirve para facets, y sin
 * tope un `createMany` sin límite sería un vector de abuso.
 */
export const MAX_GENRES_PER_GAME = 6

/**
 * Lectura de los géneros en los cuerpos de `POST /api/games` y
 * `PATCH /api/games/{id}`.
 *
 * El género es una referencia a la tabla `Genre`, así que la validación es la de
 * cualquier otra clave foránea: si algún `id` no existe, se rechaza, en vez de
 * guardarlo y dejar la ficha apuntando a la nada. Se comprueba todo en una sola
 * consulta (`id: { in: [...] }`) y el resultado se contrasta por tamaño, que es
 * fiable porque la consulta trae una fila por género y los ids ya vienen
 * deduplicados.
 *
 * Vive aparte de `src/lib/genres.ts` porque ese módulo lo importan Client
 * Components y este necesita Prisma.
 */
export async function readGenreIds(
  value: unknown,
): Promise<{ ok: true; genreIds: string[] } | { ok: false; error: string }> {
  // Sin el campo, o con un `null` explícito, el juego se queda sin género: es un
  // dato opcional, y vaciarlo (mandar `[]`) tiene que ser una operación normal.
  if (value === undefined || value === null) return { ok: true, genreIds: [] }
  if (!Array.isArray(value)) return { ok: false, error: "invalid_genre" }

  const genreIds: string[] = []
  for (const entry of value) {
    if (typeof entry !== "string") return { ok: false, error: "invalid_genre" }
    const id = entry.trim().slice(0, 100)
    // Una cadena vacía no es un id: el cliente la manda para quitar un género.
    if (!id || genreIds.includes(id)) continue
    genreIds.push(id)
  }
  if (genreIds.length > MAX_GENRES_PER_GAME) {
    return { ok: false, error: "invalid_genre" }
  }
  if (genreIds.length === 0) return { ok: true, genreIds }

  const genres = await prisma.genre.findMany({
    where: { id: { in: genreIds } },
    select: { id: true },
  })
  if (genres.length !== genreIds.length) {
    return { ok: false, error: "invalid_genre" }
  }

  return { ok: true, genreIds: genres.map((genre) => genre.id) }
}

/**
 * Traduce el género que devuelve RAWG (texto libre) a un `id` del listado.
 *
 * Devuelve `null` cuando el catálogo trae algo que no está en la lista, en cuyo
 * caso el alta se queda con el texto suelto en `Game.genre`: es preferible
 * guardarlo y que se vea a que rechazar el alta del juego.
 */
export async function genreIdFromLabel(
  label: string | null | undefined,
): Promise<string | null> {
  const slug = matchGenreSlug(label)
  if (!slug) return null
  const genre = await prisma.genre.findUnique({
    where: { slug },
    select: { id: true },
  })
  return genre?.id ?? null
}
