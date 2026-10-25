import {
  BookOpen,
  Gamepad2,
  Package,
  ToyBrick,
  Tv,
  type LucideIcon,
} from "lucide-react"
import { CollectionKind } from "@/generated/prisma/enums"

/**
 * Tipos de artículo que puede guardar la colección.
 *
 * El modelo de datos sigue llamándose `Game`, pero `Game.kind` distingue
 * videojuegos de consolas, accesorios, figuras y libros (con cómics y mangas
 * dentro de `BOOK`). El orden es el de los selectores y filtros, no el
 * alfabético: primero el caso mayoritario (juego) y después el resto.
 */
export const COLLECTION_KINDS = [
  CollectionKind.GAME,
  CollectionKind.CONSOLE,
  CollectionKind.ACCESSORY,
  CollectionKind.FIGURE,
  CollectionKind.BOOK,
] as const

export type CollectionKindKey = (typeof COLLECTION_KINDS)[number]

/** Valor por defecto para filas antiguas o payloads RSC cacheados. */
export const DEFAULT_KIND: CollectionKindKey = CollectionKind.GAME

export function isCollectionKind(value: unknown): value is CollectionKindKey {
  return (
    typeof value === "string" &&
    (COLLECTION_KINDS as readonly string[]).includes(value)
  )
}

/** Icono de cada tipo, para filtros, tarjetas y fichas. */
export const KIND_ICONS = {
  [CollectionKind.GAME]: Gamepad2,
  [CollectionKind.CONSOLE]: Tv,
  [CollectionKind.ACCESSORY]: Package,
  [CollectionKind.FIGURE]: ToyBrick,
  [CollectionKind.BOOK]: BookOpen,
} satisfies Record<CollectionKindKey, LucideIcon>

/**
 * Solo un juego exige plataforma. En el resto es opcional (por ejemplo, un
 * accesorio "compatible con PS5" o la plataforma de un libro digital).
 */
export function kindRequiresPlatform(kind: CollectionKindKey): boolean {
  return kind === CollectionKind.GAME
}

/**
 * Una figura o una consola no se asignan a una plataforma: no son juegos ni
 * accesorios compatibles, así que el campo ni se pinta ni se guarda. El resto de
 * tipos lo conserva opcional.
 */
export function kindSupportsPlatform(kind: CollectionKindKey): boolean {
  return kind !== CollectionKind.FIGURE && kind !== CollectionKind.CONSOLE
}

/**
 * Las figuras y consolas no tienen género en el catálogo de `Genre` (esa lista
 * describe videojuegos). El resto de tipos lo conserva opcional.
 */
export function kindSupportsGenre(kind: CollectionKindKey): boolean {
  return kind !== CollectionKind.FIGURE && kind !== CollectionKind.CONSOLE
}

/**
 * Una figura o consola no tiene desarrollador; su dato de autoría es el
 * fabricante, que vive en `publisher`. El resto de tipos conserva el campo
 * (autor, fabricante, desarrollador…) con su etiqueta.
 */
export function kindSupportsDeveloper(kind: CollectionKindKey): boolean {
  return kind !== CollectionKind.FIGURE && kind !== CollectionKind.CONSOLE
}

/** El tiempo jugado y las piezas físicas (cartucho/disco, caja, manual) solo
 * tienen sentido en videojuegos. */
export function kindSupportsPlaytime(kind: CollectionKindKey): boolean {
  return kind === CollectionKind.GAME
}

export function kindSupportsParts(kind: CollectionKindKey): boolean {
  return kind === CollectionKind.GAME
}

/**
 * Serie o línea. En un juego el catálogo ya aporta la franquicia, y pedirla en
 * el alta manual sería ruido; una consola tampoco pertenece a una serie. En
 * figuras y libros (incluidos cómics y mangas) es el dato que ordena la
 * colección.
 */
export function kindSupportsSeries(kind: CollectionKindKey): boolean {
  return kind === CollectionKind.FIGURE || kind === CollectionKind.BOOK
}

/**
 * Número de tomo/volumen. Solo los libros (con cómics y mangas) se numeran; una
 * figura pertenece a una serie pero no tiene tomo.
 */
export function kindSupportsVolume(kind: CollectionKindKey): boolean {
  return kind === CollectionKind.BOOK
}

/** Año de lanzamiento. Solo lo usan las consolas. */
export function kindSupportsReleaseYear(kind: CollectionKindKey): boolean {
  return kind === CollectionKind.CONSOLE
}

/** Rango aceptado para el año de lanzamiento, compartido por API y formularios. */
export const MIN_RELEASE_YEAR = 1900
export const MAX_RELEASE_YEAR = 2100

export function isValidReleaseYear(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= MIN_RELEASE_YEAR &&
    year <= MAX_RELEASE_YEAR
  )
}
