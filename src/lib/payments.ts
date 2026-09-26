import "server-only"
import {
  mapStripeStatus,
  stripe,
  type StripeSubscriptionStatus,
} from "@/lib/stripe"
import { priceIdForPlan, planFromPriceId, type PaidPlan } from "@/lib/billing"
import {
  createMpCheckoutOrder,
  isMpConfigured,
  mpAmountForPlan,
  mpCheckoutBlocker,
} from "@/lib/mp"

export type { PaidPlan }

export type BillingUser = {
  id: string
  email: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  /** Inicio del último periodo pagado con MP (`null` si nunca ha pagado). */
  mpLastChargeAt: Date | null
}

export type Provider = "stripe" | "mp"

export type CheckoutResult = {
  url: string
  kind: "checkout" | "portal"
  stripeCustomerId?: string
}

/*
 * Resultado de un cambio de plan sobre una suscripción YA existente. `plan` y
 * `status` vienen del proveedor (nunca del cliente) y vienen a `null` cuando
 * el proveedor todavía no ha confirmado el cambio: en ese caso `url` lleva al
 * cliente a donde tiene que autorizar el pago y el webhook hará el resto.
 */
export type UpgradeResult = {
  plan: PaidPlan | null
  status: StripeSubscriptionStatus | null
  url: string | null
  pending: boolean
}

export class BillingError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) {
    super(code)
    this.name = "BillingError"
    this.code = code
    this.status = status
  }
}

/*
 * `type` de un error de Stripe ("StripeCardError", "StripeInvalidRequestError",
 * ...). Se lee por forma (no con `instanceof` sobre el namespace) para no
 * arrastrar la clase de error al bundle ni depender de su forma exportada.
 */
function stripeErrorType(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null
  const type = (error as { type?: unknown }).type
  return typeof type === "string" ? type : null
}

async function stripeCheckoutUrl(args: {
  user: BillingUser
  plan: PaidPlan
  billingUrl: string
  locale: "es" | "en"
}): Promise<CheckoutResult> {
  const priceId = priceIdForPlan(args.plan)
  if (!priceId) throw new BillingError("plan_unavailable", 503)
  if (!stripe) throw new BillingError("stripe_not_configured", 503)

  // Suscripción activa: se gestiona desde el portal para no duplicarla
  // (upgrade/downgrade/cancel se hacen ahí).
  if (
    args.user.stripeSubscriptionId &&
    args.user.subscriptionStatus === "ACTIVE"
  ) {
    if (!args.user.stripeCustomerId) throw new BillingError("unknown", 500)
    const portal = await stripe.billingPortal.sessions.create({
      customer: args.user.stripeCustomerId,
      return_url: args.billingUrl,
    })
    if (!portal.url) throw new BillingError("unknown", 500)
    return { url: portal.url, kind: "portal" }
  }

  let customerId = args.user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.user.email,
      metadata: { userId: args.user.id },
    })
    customerId = customer.id
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: args.user.id, plan: args.plan },
    success_url: `${args.billingUrl}?checkout=success`,
    cancel_url: `${args.billingUrl}?checkout=canceled`,
    locale: args.locale,
  })
  if (!checkout.url) throw new BillingError("unknown", 500)

  return {
    url: checkout.url,
    kind: "checkout",
    stripeCustomerId: customerId,
  }
}

/*
 * Pago en Mercado Pago con Checkout Pro (redirección).
 *
 * No hay nada que tokenizar ni que guardar: se crea una order y se devuelve la
 * `checkout_url` de MP. El usuario paga en su página (con tarjeta, dinero de la
 * cuenta, Rapipago, Pago Fácil o cuotas sin tarjeta) y MP lo devuelve a
 * `billingUrl`, que es la misma URL de los tres desenlaces.
 *
 * A diferencia de Stripe, aquí no hay "alta" ni "suscripción": cada pago da
 * `MP_BILLING_PERIOD_DAYS` de acceso y el siguiente ciclo vuelve a pasar por
 * aquí. Por eso no se bloquea el checkout cuando el usuario ya está ACTIVE: eso
 * es exactamente lo que hace un usuario renovando.
 */
async function mpCheckoutUrl(args: {
  user: BillingUser
  plan: PaidPlan
  billingUrl: string
}): Promise<CheckoutResult> {
  // Configuración que no puede servir el checkout. El motivo exacto va a
  // consola; al cliente se le da el mismo error genérico que "no hay MP", sin
  // filtrar nombres de variables ni configuración del despliegue.
  const blocker = mpCheckoutBlocker()
  if (blocker) {
    console.error("mercadopago: checkout bloqueado por configuración:", blocker)
    throw new BillingError("mp_not_configured", 503)
  }

  const amount = mpAmountForPlan(args.plan)
  if (!amount) throw new BillingError("plan_unavailable", 503)

  const { orderId, checkoutUrl } = await createMpCheckoutOrder({
    plan: args.plan,
    amount,
    userId: args.user.id,
    title: MP_ITEM_TITLES[args.plan],
    returnUrl: args.billingUrl,
  })

  // La order nace `created`: todavía no se ha pagado nada, así que NO se toca la
  // fila del usuario. El plan lo concede quien repregunte el estado real de la
  // order (el webhook `order` o la vuelta del usuario).
  console.error(`mercadopago: order ${orderId} creada para el checkout`)
  return { url: checkoutUrl, kind: "checkout" }
}

/** Nombre del producto que ve el usuario en la página de MP. */
const MP_ITEM_TITLES: Record<PaidPlan, string> = {
  PRO: "GameVault PRO (30 días)",
  COLLECTOR: "GameVault COLLECTOR (30 días)",
}

export async function checkoutUrl(args: {
  provider: Provider
  user: BillingUser
  plan: PaidPlan
  billingUrl: string
  locale: "es" | "en"
}): Promise<CheckoutResult> {
  if (args.provider === "stripe") {
    return stripeCheckoutUrl({
      user: args.user,
      plan: args.plan,
      billingUrl: args.billingUrl,
      locale: args.locale,
    })
  }
  return mpCheckoutUrl({
    user: args.user,
    plan: args.plan,
    billingUrl: args.billingUrl,
  })
}

/*
 * Upgrade en Stripe: se sustituye el price del item de la suscripción en
 * curso. Con `proration_behavior: "always_invoice"` Stripe emite y cobra al
 * momento la factura prorrateada por lo que falte del periodo, así que el
 * cambio es inmediato (y queda facturado, no es un periodo gratis).
 *
 * `payment_behavior` se deja en su valor por defecto a propósito: si la
 * tarjeta necesita 3DS no queremos rechazar el upgrade, Stripe deja la
 * factura abierta y `invoice.payment_failed` marca PAST_DUE (ya contemplado en
 * el webhook).
 */
async function stripeUpgradePlan(args: {
  user: BillingUser
  plan: PaidPlan
}): Promise<UpgradeResult> {
  const priceId = priceIdForPlan(args.plan)
  if (!priceId) throw new BillingError("plan_unavailable", 503)
  if (!stripe) throw new BillingError("stripe_not_configured", 503)
  if (!args.user.stripeSubscriptionId) {
    throw new BillingError("no_active_subscription", 409)
  }

  const current = await stripe.subscriptions.retrieve(
    args.user.stripeSubscriptionId,
  )
  const item = current.items?.data?.[0]
  if (!item) throw new BillingError("subscription_not_updatable", 409)
  if (planFromPriceId(item.price?.id) === args.plan) {
    throw new BillingError("already_active", 409)
  }

  let updated
  try {
    updated = await stripe.subscriptions.update(args.user.stripeSubscriptionId, {
      items: [{ id: item.id, price: priceId, quantity: 1 }],
      proration_behavior: "always_invoice",
    })
  } catch (error) {
    // El detalle (motivo del rechazo, código de tarjeta) solo a consola.
    console.error("[payments:upgrade] stripe subscriptions.update:", error)
    if (stripeErrorType(error) === "StripeCardError") {
      throw new BillingError("card_error", 402)
    }
    throw new BillingError("subscription_not_updatable", 409)
  }

  // El plan se relee del price REAL devuelto por Stripe (autoritativo) y no
  // del slug que nos pidieron: es el mismo criterio que usa el webhook.
  const confirmed = planFromPriceId(updated.items?.data?.[0]?.price?.id)
  if (!confirmed) {
    console.error("[payments:upgrade] price inesperado tras el upgrade")
    throw new BillingError("unknown", 500)
  }
  return {
    plan: confirmed,
    status: mapStripeStatus(updated.status),
    url: null,
    pending: false,
  }
}

/*
 * Upgrade en Mercado Pago: no hay nada que cambiar en la API de MP porque no hay
 * suscripción ni tarjeta guardada. Subir de plan es, simplemente, pagar el plan
 * nuevo: se devuelve la `checkout_url` de una order por su importe, y el plan
 * entra cuando esa order se apruebe (mismo camino que un alta).
 *
 * No hay prorrateo: el usuario paga el plan nuevo íntegro y su periodo arranca
 * desde ese pago, sin conservar el tiempo que le quedaba del anterior.
 */
async function mpUpgradePlan(args: {
  user: BillingUser
  plan: PaidPlan
  billingUrl: string
}): Promise<UpgradeResult> {
  const { url } = await mpCheckoutUrl({
    user: args.user,
    plan: args.plan,
    billingUrl: args.billingUrl,
  })
  return { plan: null, status: null, url, pending: true }
}

/**
 * Baja en Mercado Pago. No hay nada que cancelar del lado de MP: como no se
 * guarda tarjeta ni hay cobro programado, simplemente nadie cobra al mes
 * siguiente. El caller devuelve el plan a FREE, y el periodo ya pagado se
 * respeta solo hasta que el barrido lo venza.
 */
export function cancelMpSubscription(): void {
  if (!isMpConfigured()) throw new BillingError("mp_not_configured", 503)
}

/**
 * Cambia el plan de una suscripción ya activa por uno superior. El proveedor
 * se decide en servidor a partir de la suscripción real del usuario; el
 * destino solo se acepta contra la allowlist de `PAID_PLANS` (validado por la
 * ruta antes de llegar aquí).
 */
export async function upgradePlan(args: {
  provider: Provider
  user: BillingUser
  plan: PaidPlan
  billingUrl: string
}): Promise<UpgradeResult> {
  if (args.provider === "stripe") {
    return stripeUpgradePlan({ user: args.user, plan: args.plan })
  }
  return mpUpgradePlan({
    user: args.user,
    plan: args.plan,
    billingUrl: args.billingUrl,
  })
}

/*
 * Portal de autogestión. Solo Stripe tiene una URL de portal: en MP la
 * autogestión es cancelar (que es no cobrar el mes siguiente) y no tiene a dónde
 * enviar al usuario, así que lo resuelve `cancelMpSubscription` y lo decide la
 * ruta.
 */
export async function portalUrl(args: {
  provider: Provider
  customerId: string
  billingUrl: string
}): Promise<string> {
  if (args.provider !== "stripe") {
    throw new BillingError("no_self_service", 400)
  }
  return stripePortalUrl(args)
}

async function stripePortalUrl(args: {
  customerId: string
  billingUrl: string
}): Promise<string> {
  if (!stripe) throw new BillingError("stripe_not_configured", 503)
  const portal = await stripe.billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.billingUrl,
  })
  if (!portal.url) throw new BillingError("unknown", 500)
  return portal.url
}