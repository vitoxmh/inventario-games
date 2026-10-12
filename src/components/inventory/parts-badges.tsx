import { PARTS_ICONS, isPhysicalStatus, presentParts, type PartsLabels } from "@/lib/game-parts"

/**
 * Qué tiene la copia, en fila de pastillas bajo la portada.
 *
 * Va con la imagen y no en el bloque de datos porque es el detalle que se mira al
 * coges el juego de la estantería, no un dato más de la ficha: al lado del
 * cartucho se ve si están la caja y el manual. Cada pieza sale con su icono de
 * `PARTS_ICONS`, el mismo que su interruptor en el formulario, para que el
 * marcado y la lectura hablen el mismo idioma.
 *
 * Solo se pinta en copias físicas: en digital o en la lista de deseos no hay caja
 * ni manual que comprobar, y una tira vacía parece un fallo de carga.
 */
export function PartsBadges({
  parts,
  status,
  labels,
  title,
}: {
  /** Piezas que FALTAN, tal y como las guarda `Game.parts`. */
  parts: readonly string[] | null | undefined
  status: string | null | undefined
  labels: PartsLabels & { none: string }
  /** Texto accesible del grupo, ya traducido ("Qué tengo"). */
  title: string
}) {
  if (!isPhysicalStatus(status)) return null

  const present = presentParts(parts)

  if (present.length === 0) {
    return (
      <p className="parts-badges parts-badges--empty">
        <span className="parts-badges__none">{labels.none}</span>
      </p>
    )
  }

  return (
    <ul className="parts-badges" aria-label={title}>
      {present.map((key) => {
        const PartIcon = PARTS_ICONS[key]
        return (
          <li key={key} className="parts-badge">
            <PartIcon className="parts-badge__icon" aria-hidden="true" />
            {labels[key]}
          </li>
        )
      })}
    </ul>
  )
}
