/**
 * Utilidades de valoración compartidas entre servidor y cliente.
 *
 * Este módulo NO lleva `"use client"` a propósito: la ficha del juego es un
 * Server Component y necesita `ratingLabel` para pintar el `aria-label` de las
 * estrellas, y un Server Component no puede invocar funciones exportadas por un
 * módulo de cliente. Por eso vive aquí, y los componentes de `rating.tsx` lo
 * importan en lugar de redeclararlo.
 */

/** Número de niveles de la valoración. */
export const MAX_RATING = 5

/**
 * Rellena `{rating}` y `{max}` en las plantillas de accesibilidad.
 *
 * Los rótulos van en el diccionario, no en el componente: la valoración se
 * muestra en español y en inglés, y un `aria-label` fijo aquí anunciaría
 * "4 de 5 estrellas" a un lector de pantalla en inglés.
 */
export function ratingLabel(template: string, rating: number): string {
  return template
    .replace("{rating}", String(rating))
    .replace("{max}", String(MAX_RATING))
}
