import "server-only"
import type Stripe from "stripe"
import {
  mapStripeStatus,
  stripe,
  type StripeSubscriptionStatus,
} from "@/lib/stripe"
import { priceIdForPlan, planFromPriceId, type PaidPlan } from "@/lib/billing"
import {
  MP_BILLING_PERIOD_DAYS,
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

/**
 * Estado autoritativo de la suscripción según el proveedor, para que la ruta
 * pueda sincronizar la fila local cuando esta esté desfasada. Los campos que no
 * se pueden derivar se omiten: `plan` es obligatorio en la BD y mandarlo a null
 * reventaría el update.
 */
export type BillingSync = {
  plan?: PaidPlan
  subscriptionStatus?: StripeSubscriptionStatus
  stripeSubscriptionId?: string | null
}

export type CheckoutResult = {
  url: string
  kind: "checkout" | "portal"
  stripeCustomerId?: string
  /** Verdad del proveedor para arreglar la fila local; la aplica la ruta. */
  sync?: BillingSync
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

/**
 * Estados en los que la suscripción sigue viva y ocupando plaza. `past_due` y
 * `unpaid` cuentan: la suscripción existe y se sigue cobrando, así que vender
 * otra sería duplicar el cargo aunque el cobro esté fallando.
 */
const LIVE_SUB_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
])

/**
 * Suscripción viva del cliente en Stripe, o `null` si no tiene ninguna. Si la
 * API falla, el error sube: se prefiere no abrir un checkout antes que arriesgar
 * un segundo cargo (fail-closed en dinero).
 */
async function liveStripeSubscription(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const list = await stripe!.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  })
  return list.data.find((s) => LIVE_SUB_STATUSES.has(s.status)) ?? null
}

/**
 * Verdad de la suscripción según Stripe, para sincronizar la fila local. El
 * plan sale del price id real (nunca del cliente) y los campos que no se pueden
 * derivar se omiten en vez de mandarse a null, porque `plan` no admite null.
 */
function syncFromStripeSub(sub: Stripe.Subscription): BillingSync {
  const priceId = sub.items?.data?.[0]?.price?.id
  const plan = priceId ? planFromPriceId(priceId) : null
  const status = mapStripeStatus(sub.status)
  return {
    ...(plan ? { plan } : {}),
    ...(status ? { subscriptionStatus: status } : {}),
    stripeSubscriptionId: sub.id,
  }
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

  let customerId = args.user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.user.email,
      metadata: { userId: args.user.id },
    })
    customerId = customer.id
  }

  /*
   * Una suscripción viva NO se vuelve a vender: se gestiona desde el portal
   * (upgrade/downgrade/cancel se hacen ahí).
   *
   * La pregunta se le hace a **Stripe**, no a nuestra fila. El guard anterior
   * miraba `stripeSubscriptionId` + `subscriptionStatus`, y esos dos campos los
   * escribe únicamente el webhook: si el webhook tarda, está sin registrar o su
   * URL no es alcanzable, la fila dice FREE, el guard no ve nada y cada clic
   * vendía el mismo plan otra vez (dos suscripciones COLLECTOR en dos minutos, y
   * cobrando las dos). Stripe es la fuente de verdad y se consulta en cada
   * intento.
   *
   * Si la fila local no cuadra con lo que dice Stripe, se devuelve `sync` para
   * que la ruta la arregle: así el guard no depende de que el webhook llegue y,
   * de paso, la app se autoconcilla en el siguiente intento de pago.
   */
  const live = await liveStripeSubscription(customerId)
  if (live) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: args.billingUrl,
    })
    if (!portal.url) throw new BillingError("unknown", 500)
    return { url: portal.url, kind: "portal", sync: syncFromStripeSub(live) }
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

  /*
   * While the paid period is alive, no new order opens: paying twice in a row
   * would be paying for two months. It is a soft guard (409), not a redirect to
   * a portal, because MP has no portal: the user simply renews when the period
   * runs out.
   *
   * Honest limit: `mpLastChargeAt` is written by the `order` webhook, so this
   * still depends on the webhook being reachable. Unlike Stripe, here the state
   * cannot be asked authoritatively: `order.search` answers 400 with the token
   * we hold, so there is no way to list a user's payments without the webhook.
   * That is also why the success banner says "we are activating" and not
   * "activated": at that moment we really do not know yet.
   */
  const chargedAt = args.user.mpLastChargeAt
  if (chargedAt) {
    const periodMs = MP_BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000
    if (chargedAt.getTime() + periodMs > Date.now()) {
      throw new BillingError("mp_period_active", 409)
    }
  }

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