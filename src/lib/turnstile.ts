/*
 * Verificación server-side de Cloudflare Turnstile.
 *
 * El widget del cliente (src/components/auth/turnstile.tsx) obtiene un token
 * de un solo uso con una validez de 5 minutos; aquí se valida contra
 * siteverify, que es la única fuente fiable: un string cualquiera enviado por
 * el cliente también "pasa" el cliente.
 *
 * Sin TURNSTILE_SECRET_KEY la verificación se OMITE en desarrollo (warning en
 * consola) para que registro/login sigan funcionando en local y previews. En
 * producción NO se omite nunca: fail closed, porque un forgot de la secret no
 * puede dejar el alta de cuentas (o el login por contraseña) abierta a bots.
 */

import { randomUUID } from "node:crypto"

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"
// Cloudflare: "Maximum length: 2048 characters" para el token.
const MAX_TOKEN_LENGTH = 2048
const TIMEOUT_MS = 5000
// `timeout-or-duplicate` también aparece cuando la respuesta se perdió por
// red: Cloudflare permite reintentar UNA vez con la misma idempotency_key.
const RETRY_ERROR_CODES = new Set(["timeout-or-duplicate"])

type SiteverifyResponse = {
  success?: boolean
  hostname?: string
  action?: string
  "error-codes"?: string[]
}

export type TurnstileResult = {
  ok: boolean
  /** Verificación omitida por falta de TURNSTILE_SECRET_KEY (solo desarrollo). */
  skipped?: boolean
  hostname?: string
  reason?:
    | "not_configured"
    | "missing_token"
    | "invalid_token"
    | "network_error"
}

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}

function normalizedToken(token: unknown): string {
  return typeof token === "string" ? token.trim() : ""
}

/*
 * Solo se manda remoteip si parece una IP de verdad: en local
 * x-forwarded-for trae "::1" o nombres de host, valores que siteverify no
 * espera (y que solo sirven para endurecer el score del lado de Cloudflare).
 */
function looksLikeIp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 45 &&
    /^[0-9a-f:.]+$/i.test(value)
  )
}

async function siteverify(
  body: URLSearchParams,
): Promise<SiteverifyResponse | null> {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error("[turnstile] siteverify respondió", response.status)
      return null
    }
    return (await response.json()) as SiteverifyResponse
  } catch (error) {
    console.error("[turnstile] siteverify falló:", error)
    return null
  }
}

export async function verifyTurnstileToken(params: {
  token: unknown
  remoteIp?: unknown
}): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[turnstile] TURNSTILE_SECRET_KEY no configurado en producción: petición rechazada.",
      )
      return { ok: false, reason: "not_configured" }
    }
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY no configurado: verificación omitida.",
    )
    return { ok: true, skipped: true }
  }

  const token = normalizedToken(params.token)
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "missing_token" }
  }

  const idempotencyKey = randomUUID()
  const body = new URLSearchParams({
    secret,
    response: token,
    idempotency_key: idempotencyKey,
  })
  if (looksLikeIp(params.remoteIp)) {
    body.set("remoteip", params.remoteIp)
  }

  let data = await siteverify(body)

  if (
    data &&
    data.success !== true &&
    data["error-codes"]?.some((code) => RETRY_ERROR_CODES.has(code))
  ) {
    // Reintento único con la MISMA idempotency_key (Cloudflare no duplica el
    // consumo del token si la primera llamada sí llegó a procesarse).
    data = await siteverify(body)
  }

  if (!data) {
    return { ok: false, reason: "network_error" }
  }

  if (data.success !== true) {
    console.warn(
      "[turnstile] token rechazado:",
      data["error-codes"]?.join(", ") ?? "sin código de error",
    )
    return { ok: false, reason: "invalid_token" }
  }

  return { ok: true, hostname: data.hostname }
}
