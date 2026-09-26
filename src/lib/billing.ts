import "server-only"
import { mpAmountForPlan, mpCurrencyId } from "@/lib/mp"
import type { Provider } from "@/lib/providers"

/*
 * El tipo `Provider` y la lista de proveedores disponibles viven en
 * `@/lib/providers` y `@/lib/payment-providers` (ahí se cruzan las variables de
 * entorno con el interruptor del admin). Aquí solo vive la lógica de planes y
 * precios, y el tipo se reexporta para no cambiar las imports de los callers.
 */
export type { Provider }

/*
 * Escalera de planes. Es la ÚNICA fuente de verdad del orden y de los planes
 * comprables: el rango (FREE=0 < COLLECTOR=1 < PRO=2) sale de derivarse de
 * este array, no de un objeto escrito a mano. Cualquier sitio que necesite
 * "el siguiente nivel" o "esto es una subida" lo pregunta aquí, y la tabla
 * `Plan` de la BD (límites, nombres, `sortOrder`) se mantiene alineada con
 * este orden por la migración que lo acompaña.
 */
export const PLAN_LADDER = ["FREE", "COLLECTOR", "PRO"] as const

export type PlanSlug = (typeof PLAN_LADDER)[number]

/** Planes de pago: los únicos que se pueden comprar o mejorar. */
export type PaidPlan = Exclude<PlanSlug, "FREE">

export const PAID_PLANS: readonly PaidPlan[] = PLAN_LADDER.filter(
  (slug): slug is PaidPlan => slug !== "FREE",
)

/*
 * Rango de cada plan. Los webhooks lo usan como "guardia de rango" para no
 * degradar al usuario por eventos reordenados o reintentos.
 */
export const TIER_RANK: Record<string, number> = Object.fromEntries(
  PLAN_LADDER.map((slug, index) => [slug, index]),
)

/** ¿Es `slug` un plan de pago comprable? (allowlist, no dato del cliente) */
export function isPaidPlanSlug(slug: string): slug is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(slug)
}

/** ¿Subir de `from` a `to` es una mejora (no una bajada ni el mismo plan)? */
export function isUpgrade(from: string, to: string): boolean {
  return (TIER_RANK[to] ?? -1) > (TIER_RANK[from] ?? 0)
}

/**
 * Proveedor de la suscripción activa, deducido de qué referencia externa tiene el
 * usuario. Nunca se acepta del cliente: el proveedor se decide en servidor.
 *
 * En MP no hay id de suscripción que mirar (no se guarda tarjeta ni hay cobro
 * programado): la marca de que el pago vino de MP es `mpLastChargeAt`, que el
 * webhook `order` pone al aprobarse el pago y que el barrido diario limpia al
 * degradar a FREE. Un usuario de Stripe tiene siempre esa columna a `null`.
 */
export function activeProviderFor(user: {
  stripeSubscriptionId: string | null
  mpLastChargeAt: Date | null
}): Provider | null {
  if (user.stripeSubscriptionId) return "stripe"
  if (user.mpLastChargeAt) return "mp"
  return null
}

export type PlanMeta = {
  priceCents: number | null
  priceEnvKey: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_COLLECTOR" | null
}

/**
 * A dónde vuelve el usuario tras pagar: se la mandamos a los proveedores como
 * `return_url`/`back_url` y es la que Stripe guarda en la sesión del portal.
 *
 * NUNCA se construye con el origen de la petición. `${url.protocol}//${url.host}`
 * sale de la cabecera `Host` del cliente, que es falsificable: quien controle su
 * `Host` lograría que el proveedor devolviera al comprador a un sitio suyo, y en
 * local es lo que hace que un `return_url` acabe en `localhost:3100` mientras la
 * app se sirve en otro puerto. Se usa la URL pública configurada (la misma
 * `SITE_URL`/`NEXT_PUBLIC_APP_URL` de la que salen canonical, OG y sitemap) y,
 * solo si no hay ninguna, se cae al host de la petición: en desarrollo no hay
 * otra cosa a la que apelar.
 *
 * El locale va contra una allowlist de dos valores en el llamante y la ruta es
 * una constante del repo, así que la URL resultante siempre es interna: no hay
 * open redirect por aquí.
 */
export function billingReturnUrl(
  locale: "es" | "en",
  requestUrl: string,
): string {
  const configured = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  let base: string
  try {
    // `.origin` de una URL con ruta la deja limpia a propósito: el prefijo de
    // path se ignora igual que en `absoluteUrl`.
    base = configured ? new URL(configured).origin : new URL(requestUrl).origin
  } catch {
    base = new URL(requestUrl).origin
  }
  return `${base}/${locale}/app/billing`
}

/*
 * Los precios se declaran en céntimos (USD) para evitar errores de coma
 * flotante, y van en la MISMA posición que la escalera: el plan intermedio es
 * Coleccionista ($4.99) y el superior es Pro ($9.99). El price id real
 * proviene de una variable de entorno: en ningún momento se confía en un
 * price id enviado por el cliente.
 */
export const PLAN_META: Record<string, PlanMeta> = {
  FREE: { priceCents: null, priceEnvKey: null },
  COLLECTOR: { priceCents: 499, priceEnvKey: "STRIPE_PRICE_COLLECTOR" },
  PRO: { priceCents: 999, priceEnvKey: "STRIPE_PRICE_PRO" },
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

/** Precio de un plan en céntimos, o `null` si es gratuito / no está en la escalera. */
export function planPriceCents(slug: string): number | null {
  return PLAN_META[slug]?.priceCents ?? null
}

/** Precio de un plan ya formateado para pintar (los cobros son en USD fijo). */
export function formatUsd(cents: number | null): string {
  return usd.format((cents ?? 0) / 100)
}

export function priceIdForPlan(plan: string): string | null {
  const meta = PLAN_META[plan]
  if (!meta?.priceEnvKey) return null
  return process.env[meta.priceEnvKey] ?? null
}

export function planFromPriceId(
  priceId: string | null | undefined,
): "PRO" | "COLLECTOR" | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "PRO"
  if (priceId && priceId === process.env.STRIPE_PRICE_COLLECTOR)
    return "COLLECTOR"
  return null
}

/*
 * Precio por proveedor. Stripe cobra en USD (los importes viven en
 * `PLAN_META`, en céntimos), pero Mercado Pago cobra en la moneda de su sitio
 * (CLP, ARS, MXN...) y la de cada plan viene de `MP_PRICE_*`. Mostrar siempre
 * el precio en USD y cobrar en pesos sería mentirle al usuario, así que la
 * tarjeta de cada plan se pinta en la moneda del proveedor elegido.
 */
export function formatPriceForProvider(args: {
  slug: string
  provider: Provider
  locale: "es" | "en"
}): string | null {
  if (args.provider === "stripe") {
    return formatUsd(planPriceCents(args.slug))
  }
  const currency = mpCurrencyId()
  const amount = mpAmountForPlan(args.slug as PaidPlan)
  if (!currency || !amount) return null
  // `currencyDisplay: "code"` a proposito: el simbolo del peso chileno es "$"
  // igual que el del dolar, y "4.990 $" seria ambiguo.
  const formatter = new Intl.NumberFormat(
    args.locale === "en" ? "en-US" : "es-ES",
    { style: "currency", currency, currencyDisplay: "code" },
  )
  return formatter.format(Number(amount))
}