import type { Locale } from "@/lib/i18n/locales"

/**
 * Listado cerrado de géneros.
 *
 * Es la fuente de verdad del *seed* y del emparejador de valores sueltos. La
 * tabla `Genre` de la BD es la que manda en tiempo de ejecución (la edita el
 * admin en `/admin/genres`); esta lista solo sirve para sembrarla y para
 * traducir lo que venga de fuera, sobre todo el género que devuelve RAWG.
 *
 * `slug` es la clave estable: los dos idiomas son solo la etiqueta que se
 * muestra, así que reescribir un nombre no rompe nada.
 */
export const GENRE_SEED = [
  { slug: "action", nameEs: "Acción", nameEn: "Action" },
  { slug: "adventure", nameEs: "Aventura", nameEn: "Adventure" },
  { slug: "rpg", nameEs: "RPG", nameEn: "RPG" },
  { slug: "strategy", nameEs: "Estrategia", nameEn: "Strategy" },
  { slug: "tactics", nameEs: "Táctica", nameEn: "Tactics" },
  { slug: "shooter", nameEs: "Disparo", nameEn: "Shooter" },
  { slug: "run-and-gun", nameEs: "Run and gun", nameEn: "Run and gun" },
  { slug: "platform", nameEs: "Plataformas", nameEn: "Platform" },
  { slug: "beat-em-up", nameEs: "Peleas callejeras", nameEn: "Beat 'em up" },
  { slug: "fighting", nameEs: "Lucha", nameEn: "Fighting" },
  { slug: "stealth", nameEs: "Sigilo", nameEn: "Stealth" },
  { slug: "survival-horror", nameEs: "Supervivencia y terror", nameEn: "Survival Horror" },
  { slug: "survival", nameEs: "Supervivencia", nameEn: "Survival" },
  { slug: "roguelike", nameEs: "Roguelike", nameEn: "Roguelike" },
  { slug: "puzzle", nameEs: "Puzles", nameEn: "Puzzle" },
  { slug: "simulation", nameEs: "Simulación", nameEn: "Simulation" },
  { slug: "racing", nameEs: "Carreras", nameEn: "Racing" },
  { slug: "sports", nameEs: "Deportes", nameEn: "Sports" },
  { slug: "rhythm", nameEs: "Ritmo", nameEn: "Rhythm" },
  { slug: "music", nameEs: "Música", nameEn: "Music" },
  { slug: "party", nameEs: "Fiesta", nameEn: "Party" },
  { slug: "board", nameEs: "Tablero", nameEn: "Board" },
  { slug: "card", nameEs: "Cartas", nameEn: "Card" },
  { slug: "sandbox", nameEs: "Sandbox", nameEn: "Sandbox" },
  { slug: "educational", nameEs: "Educativo", nameEn: "Educational" },
  { slug: "indie", nameEs: "Indie", nameEn: "Indie" },
] as const

export type GenreSlug = (typeof GENRE_SEED)[number]["slug"]

/**
 * Sinónimos y variantes por las que un género puede venir escrito.
 *
 * Las claves van YA normalizadas (minúsculas, sin acentos, con espacios), que
 * es lo que devuelve `normalizeGenre`. Están aquí porque ni RAWG ni los valores
 * que escribió el usuario a mano coinciden con el listado: "Puzles", "Puzzle",
 * "Rompecabezas" o "Puzzles" son lo mismo.
 */
const ALIASES: Record<string, GenreSlug> = {
  // Acción
  action: "action",
  acciones: "action",
  accions: "action",
  // Aventura
  adventure: "adventure",
  aventuras: "adventure",
  // RPG
  rpg: "rpg",
  "role playing": "rpg",
  roleplaying: "rpg",
  rol: "rpg",
  "juego de rol": "rpg",
  "juegos de rol": "rpg",
  // Estrategia
  strategy: "strategy",
  estrategia: "strategy",
  estrategias: "strategy",
  "estrategia en tiempo real": "strategy",
  rts: "strategy",
  // Táctica
  tactics: "tactics",
  tactica: "tactics",
  tacticas: "tactics",
  // Disparo
  shooter: "shooter",
  shooters: "shooter",
  disparo: "shooter",
  disparos: "shooter",
  "juego de disparos": "shooter",
  fps: "shooter",
  // Run and gun
  "run and gun": "run-and-gun",
  "run and gun arcade": "run-and-gun",
  // Beat 'em up
  "beat em up": "beat-em-up",
  "beat em ups": "beat-em-up",
  // El híbrido de los dos se clasifica como el género más específico.
  "beat em up run and gun": "beat-em-up",
  // Plataformas
  platform: "platform",
  platforms: "platform",
  plataforma: "platform",
  plataformas: "platform",
  platformer: "platform",
  "juego de plataformas": "platform",
  arcade: "platform",
  // Lucha
  fighting: "fighting",
  pelea: "fighting",
  peleas: "fighting",
  lucha: "fighting",
  // Sigilo
  stealth: "stealth",
  sigilo: "stealth",
  infiltracion: "stealth",
  // Supervivencia y terror
  "survival horror": "survival-horror",
  terror: "survival-horror",
  "supervivencia y terror": "survival-horror",
  "sobrevivencia y terror": "survival-horror",
  // Supervivencia
  survival: "survival",
  supervivencia: "survival",
  // Roguelike
  roguelike: "roguelike",
  roguelite: "roguelike",
  roguelikes: "roguelike",
  // Puzles
  puzzle: "puzzle",
  puzzles: "puzzle",
  puzle: "puzzle",
  puzles: "puzzle",
  rompecabezas: "puzzle",
  // Simulación
  simulation: "simulation",
  simulacion: "simulation",
  simulador: "simulation",
  simuladores: "simulation",
  "simuladores de vida": "simulation",
  // Carreras
  racing: "racing",
  carrera: "racing",
  carreras: "racing",
  "carreras de coches": "racing",
  // Deportes
  sports: "sports",
  deporte: "sports",
  deportes: "sports",
  // Ritmo
  rhythm: "rhythm",
  ritmo: "rhythm",
  musical: "rhythm",
  // Música
  music: "music",
  musica: "music",
  // Fiesta
  party: "party",
  fiesta: "party",
  fiestas: "party",
  // Tablero
  board: "board",
  "board game": "board",
  tablero: "board",
  "juego de tablero": "board",
  // Cartas
  card: "card",
  cards: "card",
  cartas: "card",
  carta: "card",
  naipes: "card",
  "juego de cartas": "card",
  // Sandbox
  sandbox: "sandbox",
  // Educativo
  educational: "educational",
  educativa: "educational",
  educativo: "educational",
  educacion: "educational",
  // Indie
  indie: "indie",
  independientes: "indie",
}

export function normalizeGenre(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

/**
 * Deduce el `slug` de un género escrito libremente, o `null` si no encaja con el
 * listado. Se usa para lo que llega de RAWG y para leer lo que el usuario
 * escribió a mano en los juegos antiguos.
 */
export function matchGenreSlug(value: string | null | undefined): GenreSlug | null {
  if (!value) return null
  const needle = normalizeGenre(value)
  if (!needle) return null
  // `noUncheckedIndexedAccess` está apagado, así que el tipo hay que declararlo
  // a mano: en runtime un alias inexistente devuelve `undefined`, no `null`.
  const slug: GenreSlug | undefined = ALIASES[needle]
  return slug ?? null
}

export type GenreRow = {
  slug: string
  nameEs: string
  nameEn: string
}

/** Una fila de `Genre` con su `id`, que es lo que necesitan los selectores. */
export type GenreOption = GenreRow & { id: string }

/**
 * Etiqueta del género en el idioma de la interfaz, con el `slug` como red de
 * seguridad por si el admin dejó un nombre vacío.
 */
export function genreName(genre: GenreRow, locale: Locale): string {
  const name = locale === "en" ? genre.nameEn : genre.nameEs
  return name || genre.slug
}

/**
 * Géneros en orden alfabético POR EL IDIOMA DE LA INTERFAZ, que es como los ve
 * el usuario: en español "Acción" va primero y en inglés "Action" también, pero
 * "Peleas callejeras"/"Beat 'em up" y "Supervivencia y terror"/"Survival Horror"
 * no caerían en el mismo sitio si se ordenase por el nombre del otro idioma.
 * Por eso se ordena aquí y no en la consulta de Prisma.
 *
 * `Genre.sortOrder` (el orden manual que mueve el admin) deja de afectar a la
 * app: la escalera visible es siempre alfabética.
 *
 * `Array.prototype.sort` es estable, así que a igualdad de etiqueta se respeta el
 * orden de entrada.
 */
export function sortGenresByName<T extends GenreRow>(
  genres: T[],
  locale: Locale,
): T[] {
  return [...genres].sort((a, b) =>
    genreName(a, locale).localeCompare(genreName(b, locale), locale, {
      sensitivity: "base",
    }),
  )
}

/**
 * Etiquetas de los géneros de un juego, en el idioma de la interfaz y en orden
 * alfabético (no en el `sortOrder` de la consulta). Un juego puede tener varios,
 * así que quien los pinte decide cómo los separa.
 */
export function genreNames(genres: GenreRow[], locale: Locale): string[] {
  return sortGenresByName(genres, locale).map((genre) =>
    genreName(genre, locale),
  )
}
