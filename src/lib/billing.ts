import "server-only"
import type { Plan } from "@/generated/prisma/enums"
import { isMpConfigured } from "@/lib/mp"

export const TIER_RANK: Record<Plan, number> = {
  FREE: 0,
  PRO: 1,
  COLLECTOR: 2,
}

export type Provider = "stripe" | "mp"

export function getEnabledProviders(): Provider[] {
  const providers: Provider[] = []
  if (isStripeConfigured()) providers.push("stripe")
  if (isMpConfigured()) providers.push("mp")
  return providers
}

export type PlanMeta = {
  priceCents: number | null
  priceEnvKey: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_COLLECTOR" | null
}

/*
 * Los precios se declaran en céntimos (USD) para evitar errores de coma
 * flotante. El price id proviene de una variable de entorno: en ningún
 * momento se confía en un price id enviado por el cliente.
 */
export const PLAN_META: Record<Plan, PlanMeta> = {
  FREE: { priceCents: null, priceEnvKey: null },
  PRO: { priceCents: 499, priceEnvKey: "STRIPE_PRICE_PRO" },
  COLLECTOR: { priceCents: 999, priceEnvKey: "STRIPE_PRICE_COLLECTOR" },
}

export function priceIdForPlan(plan: Plan): string | null {
  const envKey = PLAN_META[plan].priceEnvKey
  if (!envKey) return null
  return process.env[envKey] ?? null
}

export function planFromPriceId(
  priceId: string | null | undefined,
): "PRO" | "COLLECTOR" | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "PRO"
  if (priceId && priceId === process.env.STRIPE_PRICE_COLLECTOR)
    return "COLLECTOR"
  return null
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      (process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_COLLECTOR),
  )
}