import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Crumb = {
  /** Texto visible. */
  label: string
  /** Enlace de la miga. Si falta, la miga es la actual (`aria-current`). */
  href?: string
  /** Icono delante del texto, como en el rastro del diseño. */
  icon?: ReactNode
}

/**
 * Miga de pan (rastro de navegación).
 *
 * Sigue el patrón del diseño: una línea en versalitas muy espaciadas donde el
 * último tramo es el actual y no es un enlace. Va en un `<nav>` con nombre
 * propio, que es lo que anuncia el lector de pantalla al saltar a él.
 */
export function Breadcrumb({
  label,
  items,
  className,
}: {
  /** Nombre accesible del `<nav>` ("Migas de pan"). */
  label: string
  items: Crumb[]
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <nav aria-label={label} className={cn("breadcrumb", className)}>
      <ol className="breadcrumb__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="breadcrumb__item">
              {item.href && !isLast ? (
                <Link href={item.href} className="breadcrumb__link">
                  {item.icon && (
                    <span className="breadcrumb__icon">{item.icon}</span>
                  )}
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "breadcrumb__current",
                    // El tramo actual sin `href` es el último; uno intermedio
                    // sin enlace se pinta como el actual para no fingir que se
                    // puede navegar a él.
                    !isLast && "breadcrumb__current--plain",
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.icon && <span className="breadcrumb__icon">{item.icon}</span>}
                  <span className="breadcrumb__text">{item.label}</span>
                </span>
              )}
              {!isLast && (
                <span className="breadcrumb__sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
