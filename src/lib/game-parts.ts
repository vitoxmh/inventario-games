import { BookOpen, Disc3, Package, type LucideIcon } from "lucide-react"
import { GameParts, GameStatus } from "@/generated/prisma/enums"

/**
 * Piezas de una copia física: qué tiene y qué le falta.
 *
 * Lo que se GUARDA en `Game.parts` son las piezas que FALTAN (lista vacía = no le
 * falta nada), pero lo que se PREGUNTA y lo que se MUESTRA son las que tiene: es
 * la pregunta que hace el usuario ("¿te llegaron la caja y el manual?" → "sí,
 * las dos") y la que se lee de un vistazo ("tiene caja, no tiene manual").
 *
 * El complemento son tres valores fijos, así que la inversión no necesita un
 * `SELECT` ni una tabla: son dos funciones puras que se aplican en los bordes —
 * `presentParts()` al leer de la BD y `missingParts()` al mandar el PATCH. El
 * contrato de la columna no cambia, así que no hay migración ni backfill.
 *
 * A diferencia de `Game.condition`, la lista es un enum de Prisma porque el
 * campo es nuevo: no hay datos viejos que tolerar y la BD gana la validación.
 * El orden de `GAME_PARTS_VALUES` es el de lectura (el juego, la caja, el
 * manual) y es también el que se guarda, para que la lista llegue siempre igual.
 */

/** Orden del desplegable y del almacenamiento: juego, caja, manual. */
export const GAME_PARTS_VALUES = [
  GameParts.GAME,
  GameParts.BOX,
  GameParts.MANUAL,
] as const

export type PartsKey = (typeof GAME_PARTS_VALUES)[number]

/** Etiquetas de un idioma, tal y como vienen en `inventory.parts`. */
export type PartsLabels = Record<PartsKey, string>

/** Icono de cada pieza, para el selector y para la tira de la ficha. */
export const PARTS_ICONS = {
  [GameParts.GAME]: Disc3,
  [GameParts.BOX]: Package,
  [GameParts.MANUAL]: BookOpen,
} satisfies Record<PartsKey, LucideIcon>

export function isPartsKey(value: unknown): value is PartsKey {
  return (
    typeof value === "string" &&
    (GAME_PARTS_VALUES as readonly string[]).includes(value)
  )
}

/**
 * Lee y valida una lista de piezas. `null` si no es una lista válida, para que el
 * llamante pueda responder 400 en vez de guardar un array con cualquier cosa:
 * valida elemento a elemento, quita duplicados y devuelve el orden canónico.
 */
export function readParts(value: unknown): PartsKey[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(isPartsKey)) return null
  const marked = new Set(value)
  return GAME_PARTS_VALUES.filter((key) => marked.has(key))
}

/**
 * Complemento de una lista de piezas, en el orden canónico. Lo que no esté en el
 * enumerado se ignora (no se invierte un valor desconocido), así que un dato raro
 * de otra versión no inventa una pieza que el usuario nunca marcó.
 */
function invert(value: readonly string[] | null | undefined): PartsKey[] {
  const marked = new Set(value ?? [])
  return GAME_PARTS_VALUES.filter((key) => !marked.has(key))
}

/** Piezas que tiene la copia: el complemento de lo que falta. */
export function presentParts(
  value: readonly string[] | null | undefined,
): PartsKey[] {
  return invert(value)
}

/** Piezas que le faltan: el complemento de las que tiene. Lo que se guarda. */
export function missingParts(
  value: readonly string[] | null | undefined,
): PartsKey[] {
  return invert(value)
}

/**
 * Texto de la ficha y del CSV: lo que tiene la copia. Si no le queda ninguna
 * pieza (se marcaron las tres como ausentes) se dice con `labels.none`, que es un
 * dato y no un hueco.
 */
export function presentLabel(
  value: readonly string[] | null | undefined,
  labels: PartsLabels & { none: string },
): string {
  const present = presentParts(value)
  const names = present.map((key) => labels[key])
  return names.length ? names.join(", ") : labels.none
}

/**
 * Estados en los que la copia es física y, por tanto, `parts` significa algo.
 * Los estados son de la copia (dónde está, cómo se conserva), no del formato:
 * una copia digital no tiene caja ni manual que falten, así que el campo se
 * oculta en `DIGITAL` y `WISHLIST`. Un juego en venta sí es físico, y le pasa lo
 * mismo que a uno de la colección.
 */
export const PHYSICAL_STATUSES: readonly GameStatus[] = [
  GameStatus.OWNED,
  GameStatus.SEALED,
  GameStatus.LOOSE,
  GameStatus.SELLING,
]

export function isPhysicalStatus(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    (PHYSICAL_STATUSES as readonly string[]).includes(value)
  )
}
