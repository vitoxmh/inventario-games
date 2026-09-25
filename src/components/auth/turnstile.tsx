"use client"

import Script from "next/script"
import { useCallback, useEffect, useRef } from "react"

/*
 * Widget de Cloudflare Turnstile para los formularios de auth.
 *
 * Renderizado explícito (render=explicit) en vez del implícito con la clase
 * `cf-turnstile`: así el token se entrega por callback a React y no se inyecta
 * un input oculto dentro del <form>. El token se manda en el JSON del POST
 * (o como campo extra en signIn de NextAuth), nunca por FormData.
 *
 * El script entra por <Script> de next/script para heredar el nonce de la CSP
 * (`script-src 'nonce-...' 'strict-dynamic'` en src/proxy.ts); por eso la
 * página le pasa el nonce leído de la cabecera `x-nonce`.
 */

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type TurnstileRenderOptions = {
  sitekey: string
  action?: string
  theme?: "light" | "dark" | "auto"
  size?: "normal" | "flexible" | "compact"
  appearance?: "always" | "execute" | "interaction-only"
  "response-field"?: boolean
  callback?: (token: string) => void
  "error-callback"?: (errorCode?: string) => void
  "expired-callback"?: () => void
  "timeout-callback"?: () => void
  "unsupported-callback"?: () => void
}

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string | undefined
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export function Turnstile({
  siteKey,
  action,
  nonce,
  onToken,
  onUnavailable,
  resetSignal,
}: {
  siteKey: string
  /** Etiqueta analítica devuelta por siteverify (opcional). */
  action?: string
  nonce?: string
  /** Token válido (o "" cuando caduca/falla): el padre lo guarda o lo limpia. */
  onToken: (token: string) => void
  /** El widget no se puede resolver (script bloqueado, error, timeout). */
  onUnavailable?: () => void
  /** Cambia este valor para que el widget se resetee (token de un solo uso). */
  resetSignal?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  // Los callbacks llegan por props (cambian en cada render del padre); se
  // guardan en refs para que el widget no tenga que re-renderizarse.
  const onTokenRef = useRef(onToken)
  const onUnavailableRef = useRef(onUnavailable)

  useEffect(() => {
    onTokenRef.current = onToken
    onUnavailableRef.current = onUnavailable
  }, [onToken, onUnavailable])

  const renderWidget = useCallback(() => {
    const container = containerRef.current
    const api = typeof window === "undefined" ? undefined : window.turnstile
    if (!container || !api || widgetIdRef.current !== null) return

    widgetIdRef.current =
      api.render(container, {
        sitekey: siteKey,
        action,
        theme: "auto",
        size: "flexible",
        // Managed + interaction-only: Cloudflare decide; el visitor legítimo
        // casi nunca ve nada y el bot se topa con el reto interactivo.
        appearance: "interaction-only",
        // El token viaja en el cuerpo del POST, no en un input del <form>.
        "response-field": false,
        callback: (token: string) => onTokenRef.current(token),
        "error-callback": (errorCode?: string) => {
          // 1101xx/1102xx = dominio no permitido en el widget; 200xxx = reto
          // no superado. Solo a consola: al visitante se le muestra un mensaje
          // genérico.
          console.warn("[turnstile] el widget falló:", errorCode)
          onUnavailableRef.current?.()
        },
        "expired-callback": () => onTokenRef.current(""),
        "timeout-callback": () => {
          console.warn("[turnstile] el reto interactivo caducó")
          onUnavailableRef.current?.()
        },
        "unsupported-callback": () => {
          console.warn("[turnstile] navegador no soportado por Turnstile")
          onUnavailableRef.current?.()
        },
      }) ?? null

    if (widgetIdRef.current === null) {
      console.warn("[turnstile] render() no devolvió widget")
      onUnavailableRef.current?.()
    }
  }, [action, siteKey])

  // Cliente navigating back to the page: the script is already there and
  // onReady may not fire again, so render on mount if the API is available.
  useEffect(() => {
    renderWidget()
  }, [renderWidget])

  useEffect(() => {
    return () => {
      const api = window.turnstile
      if (widgetIdRef.current !== null) {
        try {
          api?.remove(widgetIdRef.current)
        } catch (error) {
          console.error("[turnstile] no se pudo retirar el widget:", error)
        }
        widgetIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (resetSignal === undefined) return
    const widgetId = widgetIdRef.current
    // Nada que resetear todavía: el padre aún no tiene token (script sin cargar).
    if (widgetId === null) return
    window.turnstile?.reset(widgetId)
    onTokenRef.current("")
  }, [resetSignal])

  return (
    <>
      <Script
        id="turnstile-api"
        src={TURNSTILE_SCRIPT_SRC}
        strategy="afterInteractive"
        nonce={nonce}
        onReady={renderWidget}
        onError={() => onUnavailableRef.current?.()}
      />
      {/* interaction-only no pinta nada para el visitante legítimo: sin alto
          reservado para que el layout no salte cuando Cloudflare sí lo muestra. */}
      <div ref={containerRef} className="min-h-0" />
    </>
  )
}
