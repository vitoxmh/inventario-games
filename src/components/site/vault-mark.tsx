import { useId } from "react"

/**
 * Marca de QuestVault: un hexágono con una cerradura en el centro y dos puntos
 * de estado, en degradado violeta → cyan.
 *
 * Es el único elemento del chrome que no viene de lucide: es un logotipo, no un
 * icono de interfaz, así que se conserva el trazo original del diseño en lugar
 * de sustituirlo por un equivalente. Los identificadores de los degradados se
 * generan con `useId` para que dos instancias en la misma página no colisionen.
 */
export function VaultMark({ className }: { className?: string }) {
  const id = useId()

  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${id}-grad`}
          x1="0%"
          x2="100%"
          y1="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#06B6D4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M50 12 L82 30 L82 70 L50 88 L18 70 L18 30 Z"
        fill="none"
        stroke={`url(#${id}-grad)`}
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <circle
        cx="50"
        cy="50"
        r="22"
        fill="#0b1326"
        stroke={`url(#${id}-grad)`}
        strokeWidth="6"
      />
      <line
        stroke="#4cd7f6"
        strokeLinecap="round"
        strokeWidth="5"
        x1="50"
        x2="50"
        y1="38"
        y2="62"
      />
      <line
        stroke="#4cd7f6"
        strokeLinecap="round"
        strokeWidth="5"
        x1="38"
        x2="62"
        y1="50"
        y2="50"
      />
      <circle cx="72" cy="45" fill="#a078ff" r="3.5" />
      <circle cx="75" cy="54" fill="#4cd7f6" r="2.5" />
    </svg>
  )
}
