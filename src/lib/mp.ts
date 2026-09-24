import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/*
 * Cliente mínimo de Mercado Pago (APIs de Suscripciones / Preapproval).
 * Modelo MP:
 *  - `preapproval_plan`  : plan recurrente (frecuencia, importe, moneda). Se
 *    crea desde el dashboard de MP o API; nuestro servidor solo lo referencia
 *    por id desde variables de entorno (igual que los price ids de Stripe).
 *  - `preapproval`       : suscripción de un usuario a un plan. Al crearla,
 *    MP devuelve `init_point`: la URL a la que redirigimos al cliente para
 *    que autorice el cobro de su tarjeta.
 *  - Webhooks `subscription_preapproval`: avisan de authorized/cancelled/etc.
 * Como norma de seguridad, NUNCA se deriva el plan de inputs del cliente:
 * se contrasta el `preapproval_plan_id` en MP contra nuestras variables.
 */

export type MpPlan = "PRO" | "COLLECTOR"

export type MpPreapproval = {
  id: string
  status: "pending" | "authorized" | "paused" | "cancelled"
  preapproval_plan_id?: string
  payer_email?: string
  reason?: string
  external_reference?: string | null
  transaction_amount?: number | null
  [key: string]: unknown
}

const MP_API = "https://api.mercadopago.com"

function accessToken(): string | null {
  return process.env.MP_ACCESS_TOKEN ?? null
}

export function mpPreapprovalPlanIdForPlan(plan: MpPlan): string | null {
  const envKey = plan === "PRO" ? "MP_PREAPPROVAL_PLAN_PRO" : "MP_PREAPPROVAL_PLAN_COLLECTOR"
  return process.env[envKey] ?? null
}

export function mpPlanFromPreapprovalPlanId(
  preapprovalPlanId: string | null | undefined,
): MpPlan | null {
  if (preapprovalPlanId && preapprovalPlanId === process.env.MP_PREAPPROVAL_PLAN_PRO)
    return "PRO"
  if (preapprovalPlanId && preapprovalPlanId === process.env.MP_PREAPPROVAL_PLAN_COLLECTOR)
    return "COLLECTOR"
  return null
}

export function mpPriceForPlan(plan: MpPlan): string | null {
  const envKey = plan === "PRO" ? "MP_PRICE_PRO" : "MP_PRICE_COLLECTOR"
  const raw = process.env[envKey]
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : null
}

export function isMpConfigured(): boolean {
  return Boolean(
    process.env.MP_ACCESS_TOKEN &&
      process.env.MP_CURRENCY_ID &&
      (process.env.MP_PREAPPROVAL_PLAN_PRO ||
        process.env.MP_PREAPPROVAL_PLAN_COLLECTOR),
  )
}

export async function getMpPreapproval(id: string): Promise<MpPreapproval | null> {
  const token = accessToken()
  if (!token) return null
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`mercadopago:preapproval:${res.status}`)
  }
  return (await res.json()) as MpPreapproval
}

type CreatePreapprovalArgs = {
  userId: string
  email: string
  plan: MpPlan
  reason: string
  origin: string
  successPath: string
}

export async function createMpPreapprovalUrl(
  args: CreatePreapprovalArgs,
): Promise<{ url: string; preapprovalId: string }> {
  const token = accessToken()
  const planId = mpPreapprovalPlanIdForPlan(args.plan)
  const amount = mpPriceForPlan(args.plan)
  if (!token || !planId || !amount) {
    throw new Error("mercadopago:not-configured")
  }

  const body = {
    preapproval_plan_id: planId,
    payer_email: args.email,
    external_reference: `${args.userId}:${args.plan}`,
    reason: args.reason,
    back_url: `${args.origin}${args.successPath}`,
    auto_recurring: {
      transaction_amount: amount,
      currency_id: process.env.MP_CURRENCY_ID,
    },
  }

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as {
    id?: string
    init_point?: string
    error?: string
    message?: string
  } | null
  if (!res.ok || !data?.init_point || !data?.id) {
    throw new Error(
      `mercadopago:preapproval:${res.status}:${data?.error ?? data?.message ?? "unknown"}`,
    )
  }
  return { url: data.init_point, preapprovalId: data.id }
}

/*
 * Verificación de firma de webhooks de MP.
 * Headers: `x-signature=ts=<ts>,v1=<hex>` y `x-request-id`.
 * Manifiesto firmado: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * `data.id` llega como query param en el POST del webhook.
 */
export function verifyMpSignature(
  request: Request,
  dataId: string,
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return false
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")
  if (!xSignature || !xRequestId) return false

  const match = /ts=(\d+),v1=([0-9a-fA-F]{64})/.exec(xSignature)
  if (!match) return false
  const [, ts, v1] = match

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expected = createHmac("sha256", secret).update(manifest).digest()
  const received = Buffer.from(v1, "hex")
  return received.length === expected.length && timingSafeEqual(received, expected)
}