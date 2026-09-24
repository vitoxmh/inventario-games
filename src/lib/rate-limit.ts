import { NextResponse } from "next/server"

/*
 * Rate limiter en memoria (fixed window por IP).
 * Pensado para esta escala y entorno monojob. En un despliegue
 * serverless/horizontal real habría que sustituirlo por una tienda
 * compartida tipo Upstash/Redis. No es crítico para la integridad:
 * actúa como capa adicional frente a fuerza bruta y abuso.
 */

type Window = { start: number; count: number }

const store = new Map<string, Window>()

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim()
  return (
    ip ||
    request.headers.get("x-real-ip") ||
    // En localhost devuelto por Node (::1 / 127.0.0.1)
    "local"
  )
}

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now()
  let window = store.get(key)
  if (!window || now - window.start >= windowMs) {
    window = { start: now, count: 0 }
    store.set(key, window)
  }
  window.count += 1
  if (window.count > limit) {
    return true
  }
  return false
}

export function rateLimitJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds: 900 },
    { status: 429, headers: { "Retry-After": "900" } },
  )
}

export function isRateLimitedRequest(
  request: Request,
  opts: { prefix: string; limit: number; windowMs?: number },
): boolean {
  const windowMs = opts.windowMs ?? 15 * 60 * 1000
  return isRateLimited(`${opts.prefix}:${getClientIp(request)}`, opts.limit, windowMs)
}

export function tryCleanupStale(): void {
  const now = Date.now()
  for (const [key, window] of store) {
    if (now - window.start >= 15 * 60 * 1000) store.delete(key)
  }
}