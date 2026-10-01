import { GameParts, GameStatus } from "@/generated/prisma/enums"
import type { Game } from "@/generated/prisma/client"
import type { GenreOption } from "@/lib/genres"

/**
 * Fila de la tabla `Genre` con la que se pinta un juego: los dos nombres para
 * elegir el idioma más el `id`, que es lo que viaja al guardar. Es el mismo tipo
 * que usan los selectores (`GenreOption`), así que no hay dos copias del mismo
 * género que se puedan desincronizar.
 */
export type GenreRef = GenreOption

export type GameSummary = {
  id: string
  title: string
  platformId: string
  platform: string
  /**
   * Géneros del juego, ya ordenados como el selector (`sortOrder` y luego
   * `nameEs`). Un juego puede tener varios o ninguno.
   */
  genres: GenreRef[]
  developer: string | null
  publisher: string | null
  /** Valoración personal de 1 a 5; `null` = sin valorar. */
  rating: number | null
  status: keyof typeof GameStatus
  condition: string | null
  /**
   * Piezas que le FALTAN a la copia física (`GameParts`): qué cartucho/caja/manual
   * no tiene. Lista vacía = no le falta nada. Ver `src/lib/game-parts.ts`.
   */
  parts: (keyof typeof GameParts)[]
  purchasePrice: number | null
  purchaseDate: string | null
  notes: string | null
  coverImageUrl: string | null
  playtimeMin: number | null
  createdAt: string
  images: string[]
}

/** Fila de `GameGenre` tal como la devuelve la consulta de la colección. */
type GameGenreRow = {
  genre: GenreRef & { sortOrder: number }
}

type GameWithImages = Game & {
  images: Array<{ url: string }>
  platform: { name: string }
  genres: GameGenreRow[]
}

function sortGenres(
  genres: Array<GenreRef & { sortOrder: number }>,
): GenreRef[] {
  return [...genres]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.nameEs.localeCompare(b.nameEs, undefined, { sensitivity: "base" }),
    )
    .map(({ id, slug, nameEs, nameEn }) => ({ id, slug, nameEs, nameEn }))
}

/**
 * Aplana la tabla puente para la respuesta de la API.
 *
 * Prisma devuelve los géneros anidados (`[{ genre: {...} }]`) porque así es la
 * tabla, pero hacia el cliente viajan planos (`GenreRef[]`), igual que en
 * `GameSummary`: una sola forma de leer los géneros en toda la app, sin que cada
 * consumidor tenga que desarmar el `genre` a mano.
 */
export function flatGenres(row: { genres: Array<{ genre: GenreRef }> }): {
  genres: GenreRef[]
} {
  return { genres: row.genres.map((link) => link.genre) }
}

export function toGameSummary(game: GameWithImages): GameSummary {
  return {
    id: game.id,
    title: game.title,
    platformId: game.platformId,
    platform: game.platform.name,
    // El orden se resuelve en JS y no con un `orderBy` anidado sobre la relación:
    // así la lista sale igual aunque quien consulta no ordene (la API y el
    // admin), y el selector y las etiquetas de la ficha nunca discrepan. El
    // `sortOrder` se lee para ordenar, pero no viaja en el resumen: quien lo
    // muestra necesita `id`, `slug` y los dos nombres, nada más.
    genres: sortGenres(game.genres.map((row) => row.genre)),
    developer: game.developer,
    publisher: game.publisher,
    rating: game.rating,
    status: game.status,
    condition: game.condition,
    // `?? []` no es decoración: la lista es un array de enum y un `select` que se
    // quede fuera el campo (o un cliente generado antes de que existiera) devuelve
    // `undefined`, que al serializar el payload RSC viaja como `$undefined` y
    // revienta al componente que la recorre. El resumen es la frontera del
    // servidor, así que aquí se garantiza lista.
    parts: game.parts ?? [],
    purchasePrice: game.purchasePrice != null ? Number(game.purchasePrice) : null,
    purchaseDate: game.purchaseDate?.toISOString() ?? null,
    notes: game.notes,
    coverImageUrl: game.coverImageUrl,
    playtimeMin: game.playtimeMin,
    createdAt: game.createdAt.toISOString(),
    images: game.images.map((image) => image.url),
  }
}