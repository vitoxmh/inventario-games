import "server-only"
import { minorToMajor } from "@/lib/money"
import { mpCurrencyId } from "@/lib/mp"
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

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

/**
 * Precio de un plan formateado para pintar, en la moneda del proveedor al que se
 * le va a cobrar.
 *
 * Los importes NO viven aquí: vienen en la fila `Plan` y los edita el admin desde
 * `/admin/plans` (ver `getPlanPrice` en `src/lib/plans.ts`). Cada proveedor cobra
 * en su moneda —Stripe en USD, MP en la de la cuenta, CLP—, así que un mismo plan
 * tiene dos cifras y pintar siempre la de Stripe sería mentirle a quien paga por
 * MP.
 *
 * `null` = no hay precio para ese proveedor (o falta la moneda de MP), y quien
 * llama decide: en la tarjeta de facturación significa "no se ofrece por aquí".
 */
export function formatPriceForProvider(args: {
  priceCents: number | null
  mpPriceMinor: number | null
  provider: Provider
  locale: "es" | "en"
}): string | null {
  if (args.provider === "stripe") {
    if (args.priceCents === null || args.priceCents <= 0) return null
    return usd.format(args.priceCents / 100)
  }
  // Un 0 en un plan de pago significa "sin precio", no "gratis": se trata igual
  // que un null en los dos proveedores para no pintar un precio de 0 que sí es un
  // cambio de verdad en el checkout (Stripe rechazaría el importe, y MP cobraría 0).
  const currency = mpCurrencyId()
  if (args.mpPriceMinor === null || args.mpPriceMinor <= 0) return null
  const major = minorToMajor(args.mpPriceMinor, currency)
  if (!currency || !major) return null
  // `currencyDisplay: "code"` a proposito: el simbolo del peso chileno es "$"
  // igual que el del dolar, y "4.990 $" seria ambiguo.
  const formatter = new Intl.NumberFormat(
    args.locale === "en" ? "en-US" : "es-ES",
    { style: "currency", currency, currencyDisplay: "code" },
  )
  return formatter.format(Number(major))
}

/**
 * Plan de una suscripción de Stripe, leído de SU metadata.
 *
 * El plan viaja en `subscription.metadata.plan`: lo pone el checkout al crear la
 * suscripción y lo vuelve a poner el upgrade al cambiar el item. Antes se deducía
 * del id del Price y eso ya no sirve: con el importe en la base de datos el
 * checkout manda un `price_data` inline, de modo que cada compra genera un Price
 * object distinto y no hay ningún id estable al que comparar.
 *
 * La metadata la escribe siempre el servidor (el `plan` llega del cliente pero
 * validado contra `PAID_PLANS` antes de abrir el checkout) y aquí se contrasta
 * contra esa MISMA allowlist, así que sigue siendo una puerta cerrada: un valor
 * inesperado devuelve `null` y quien llama no toca el plan de nadie.
 */
export function planFromSubscriptionMetadata(metadata: {
  plan?: string | null
}): PaidPlan | null {
  const plan = metadata.plan
  return typeof plan === "string" && isPaidPlanSlug(plan) ? plan : null
}