import { NextResponse } from "next/server"
import { requireAdmin, type AdminGuard } from "@/lib/guard"
import {
  listProviderAvailability,
  setProviderEnabled,
} from "@/lib/payment-providers"
import { isProvider } from "@/lib/providers"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/*
 * Interruptor de los medios de pago. El toggle del admin solo apaga/enciende
 * compras nuevas: no toca credenciales (eso son variables de entorno) ni las
 * suscripciones ya vivas de cada cliente.
 */

function unauthorized(guard: Extract<AdminGuard, { authorized: false }>) {
  return NextResponse.json(
    { error: guard.status === 403 ? "forbidden" : "unauthorized" },
    { status: guard.status },
  )
}

export async function GET(request: Request) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return unauthorized(guard)
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "admin",
      limit: 240,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  const providers = await listProviderAvailability()
  return NextResponse.json({ providers })
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return unauthorized(guard)
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "admin",
      limit: 240,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { provider?: unknown; enabled?: unknown }
  try {
    body = (await request.json()) as { provider?: unknown; enabled?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  // `provider` no se castea: pasa por la allowlist (mismos valores que el enum
  // de Prisma). `enabled` tiene que ser un booleano de verdad, no "true" de
  // texto.
  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 })
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_enabled" }, { status: 400 })
  }

  try {
    const row = await setProviderEnabled(body.provider, body.enabled)
    const providers = await listProviderAvailability()
    return NextResponse.json({ provider: row, providers })
  } catch (error) {
    console.error("[admin/payment-providers] error guardando el toggle:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}
