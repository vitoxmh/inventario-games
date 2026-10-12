/**
 * Escalera cerrada del ESTADO FÍSICO de una copia.
 *
 * Antes `Game.condition` era texto libre y la práctica lo dejó imposible de
 * consultar: para el mismo concepto había "Buen estado", "Buen Estado", "Como
 * Nuevo" y "Como nuevo" conviviendo en la misma colección. Ahora el campo es un
 * selector, así que lo que se guarda es la CLAVE de la escalera y no la etiqueta
 * que se ve.
 *
 * Las etiquetas no viven aquí (este módulo es el que valida y es client-safe):
 * están en `messages/{es,en}.ts` bajo `inventory.conditions`, igual que las de
 * los estados en `inventory.statuses`. La allowlist de la API es
 * `CONDITION_VALUES`, nunca una cadena inventada.
 *
 * `Game.condition` sigue siendo `String?` en el schema, no un enum: no hace
 * falta una migración de tipo y `conditionLabel` tolera un valor que no esté en
 * la escalera (pintándolo tal cual) para que un dato raro no se vuelva ilegible.
 */

/** Nivel más alto a "para piezas", que es como se lee una escala de coleccionista. */
export const CONDITION_VALUES = [
  "NEW",
  "LIKE_NEW",
  "GOOD",
  "FAIR",
  "POOR",
  "FOR_PARTS",
] as const

export type ConditionKey = (typeof CONDITION_VALUES)[number]

/** Etiquetas de un idioma, tal y como vienen en `inventory.conditions`. */
export type ConditionLabels = Record<ConditionKey, string>

export function isConditionKey(value: unknown): value is ConditionKey {
  return (
    typeof value === "string" &&
    (CONDITION_VALUES as readonly string[]).includes(value)
  )
}

/**
 * Valor con el que arranca el selector. Un `condition` que no esté en la
 * escalera (un texto viejo que no llegó a normalizarse) no se muestra tal cual
 * en el desplegable porque no habría opción que seleccionarlo: se arranca en el
 * nivel más alto y, si el usuario guarda, la fila queda ya canónica.
 */
export function conditionKeyOf(value: string | null | undefined): ConditionKey {
  return isConditionKey(value) ? value : CONDITION_VALUES[0]
}

/**
 * Etiqueta de un `condition` guardado. Lo que no está en la escalera se
 * devuelve tal cual, para no perder ni tapar un dato que venga de una versión
 * anterior o de una edición directa en la base.
 */
export function conditionLabel(
  value: string | null | undefined,
  labels: ConditionLabels,
): string | null {
  if (!value) return null
  return isConditionKey(value) ? labels[value] : value
}
