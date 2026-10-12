"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { genreName, sortGenresByName, type GenreOption } from "@/lib/genres"
import type { Locale } from "@/lib/i18n/locales"

/**
 * Géneros elegidos, como etiquetas con su botón de quitar.
 *
 * El `Select` multiple de Base UI solo enseña la selección dentro del desplegable
 * (y al cerrarlo, una línea de texto que no se puede editar). Estos chips son la
 * representación real de lo que tiene el juego: se ve de un vistazo y cada uno se
 * quita sin abrir el desplegable.
 *
 * Salen en orden alfabético, igual que las opciones del desplegable del que se
 * eligieron: se ordenan por la etiqueta del idioma de la página, no por el
 * `sortOrder` de la consulta.
 *
 * No pinta nada si no hay ninguno: el género es opcional, y un hueco vacío es
 * más claro que un placeholder que sugiere que falta algo por rellenar.
 */
export function GenreChips({
  genres,
  lang,
  removeLabel,
  onRemove,
}: {
  genres: GenreOption[]
  lang: Locale
  /** Texto con `{name}`: se sustituye por la etiqueta del género. */
  removeLabel: string
  onRemove: (id: string) => void
}) {
  if (genres.length === 0) return null

  return (
    <div className="genre-chips">
      {sortGenresByName(genres, lang).map((genre) => {
        const label = genreName(genre, lang)
        return (
          <Badge key={genre.id} variant="soft" className="genre-chips__item">
            {label}
            <button
              type="button"
              className="genre-chips__remove"
              onClick={() => onRemove(genre.id)}
              aria-label={removeLabel.replace("{name}", label)}
            >
              <X aria-hidden="true" />
            </button>
          </Badge>
        )
      })}
    </div>
  )
}
