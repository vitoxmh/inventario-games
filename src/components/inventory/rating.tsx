"use client"

import { useRef } from "react"
import { Star } from "lucide-react"
import { MAX_RATING } from "@/lib/rating"
import { cn } from "@/lib/utils"

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

/**
 * Estrellas de solo lectura.
 *
 * Si el juego no está valorado no se pinta nada: cinco estrellas apagadas
 * parece un formulario a medio rellenar, y el hueco se comunica mejor con que la
 * tarjeta no lleve puntuación.
 */
export function RatingStars({
  value,
  label,
  className,
}: {
  /** 1..5, o `null`/`undefined` si el juego está sin valorar. */
  value: number | null | undefined
  /** Texto accesible, ya traducido ("4 de 5 estrellas"). */
  label: string
  className?: string
}) {
  const rating = value == null ? 0 : Math.min(MAX_RATING, Math.max(0, Math.round(value)))
  if (rating === 0) return null

  return (
    <span
      className={cn("rating-stars", className)}
      role="img"
      aria-label={label}
    >
      {range(1, MAX_RATING).map((step) => (
        <Star
          key={step}
          aria-hidden="true"
          className={cn("rating-stars__star", step <= rating && "rating-stars__star--on")}
          fill={step <= rating ? "currentColor" : "none"}
        />
      ))}
    </span>
  )
}

/**
 * Selector de valoración de 1 a 5 estrellas.
 *
 * Es un `radiogroup`: las estrellas son botones con `role="radio"` y solo el
 * valor activo entra en el orden de tabulación (roving tabindex), de modo que
 * se recorre con las flechas del teclado igual que en un grupo de radios
 * nativo, y no con cinco paradas de tabulador.
 */
export function RatingInput({
  value,
  onChange,
  label,
  optionLabel,
  clearLabel,
  className,
}: {
  /** 1..5, o `null` si está sin valorar. */
  value: number | null
  onChange: (next: number | null) => void
  label: string
  /** Rótulo accesible de cada estrella, ya traducido. */
  optionLabel: (step: number) => string
  /** Texto del botón que borra la valoración. */
  clearLabel: string
  className?: string
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const rating = value == null ? 0 : Math.min(MAX_RATING, Math.max(0, Math.round(value)))

  function move(next: number) {
    const clamped = Math.min(MAX_RATING, Math.max(1, next))
    onChange(clamped)
    // Tras cambiar el valor el elemento con foco deja de ser el activo, así que
    // el foco se pasa a la estrella recién marcada; si no, el teclado se
    // quedaría parado en un `tabIndex=-1` inalcanzable.
    listRef.current
      ?.querySelector<HTMLElement>(`[data-rating-value="${clamped}"]`)
      ?.focus()
  }

  return (
    <div className={cn("rating-input", className)}>
      <div
        ref={listRef}
        role="radiogroup"
        aria-label={label}
        className="rating-input__stars"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault()
            move(rating === 0 ? 1 : rating + 1)
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault()
            move(rating === 0 ? 1 : rating - 1)
          } else if (event.key === "Home") {
            event.preventDefault()
            move(1)
          } else if (event.key === "End") {
            event.preventDefault()
            move(MAX_RATING)
          }
        }}
      >
        {range(1, MAX_RATING).map((step) => {
          const active = step === rating
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={optionLabel(step)}
              data-rating-value={step}
              tabIndex={active || (rating === 0 && step === 1) ? 0 : -1}
              className={cn(
                "rating-input__star",
                step <= rating && "rating-input__star--on",
              )}
              onClick={() => onChange(step === rating ? null : step)}
            >
              <Star
                aria-hidden="true"
                fill={step <= rating ? "currentColor" : "none"}
              />
            </button>
          )
        })}
      </div>

      {rating > 0 && (
        <button
          type="button"
          className="rating-input__clear"
          onClick={() => onChange(null)}
        >
          {clearLabel}
        </button>
      )}
    </div>
  )
}
