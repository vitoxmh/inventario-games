"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  GAME_PARTS_VALUES,
  PARTS_ICONS,
  type PartsKey,
  type PartsLabels,
} from "@/lib/game-parts"

/**
 * Qué tiene la copia: un interruptor por pieza.
 *
 * Se llega aquí casi siempre para corregir una marca concreta ("no tiene el
 * manual"), así que la opción obvia era un desplegable múltiple como el de los
 * géneros. No compensa con solo tres valores: había que abrirlo, marcar, cerrar
 * y encima el popup tapaba el botón de guardar. Con un interruptor por pieza se
 * ve el estado de un vistazo y se corrige con un click en la baldosa.
 *
 * El interruptor marcado es la pieza que la copia TIENE, no la que le falta: la
 * pregunta del usuario es qué tiene. Quien tiene las tres marcadas deja el
 * complemento vacío, que es como se guarda una copia completa (`Game.parts` son
 * las piezas ausentes; la inversión va en `missingParts`).
 *
 * La baldosa es la etiqueta del interruptor: su `htmlFor` apunta al input
 * oculto que Base UI renderiza detrás del control, así que se puede pulsar el
 * texto sin apuntar justo a la pastilla.
 */
export function PartsPicker({
  id,
  value,
  labels,
  onChange,
}: {
  /** Prefijo único del campo. Cada interruptor cuelga de él: `${id}-${key}`. */
  id: string
  /** Piezas que tiene, ya leídas (`presentParts`) por el formulario. */
  value: PartsKey[]
  labels: PartsLabels
  onChange: (next: PartsKey[]) => void
}) {
  const toggle = (key: PartsKey, checked: boolean) => {
    const marked = new Set(value)
    if (checked) marked.add(key)
    else marked.delete(key)
    // Se filtra por `GAME_PARTS_VALUES` para que la lista salga siempre en el
    // orden de lectura (juego, caja, manual) y sin repetidos, sin importar en
    // qué orden se fue marcando.
    onChange(GAME_PARTS_VALUES.filter((k) => marked.has(k)))
  }

  return (
    <div className="parts-switch-list">
      {GAME_PARTS_VALUES.map((key) => {
        const PartIcon = PARTS_ICONS[key]
        return (
          <Label key={key} htmlFor={`${id}-${key}`} className="parts-switch">
            <PartIcon className="parts-switch__icon" aria-hidden="true" />
            <span className="parts-switch__text">{labels[key]}</span>
            <Switch
              id={`${id}-${key}`}
              checked={value.includes(key)}
              onCheckedChange={(checked) => toggle(key, checked)}
            />
          </Label>
        )
      })}
    </div>
  )
}
