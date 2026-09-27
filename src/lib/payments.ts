import "server-only"
import type Stripe from "stripe"
import {
  mapStripeStatus,
  stripe,
  type StripeSubscriptionStatus,
} from "@/lib/stripe"
import {
  planFromSubscriptionMetadata,
  type PaidPlan,
} from "@/lib/billing"
import {
  getPlan,
  getPlanDurationDays,
  getPlanPrice,
  getPlanStripeProduct,
  planDurationDaysOf,
  type PlanRow,
} from "@/lib/plans"
import {
  createMpCheckoutOrder,
  formatMpAmount,
  isMpConfigured,
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
  /**
   * Order de MP recién creada, con el id que devuelve el proveedor. La ruta la
   * persiste en `MpCheckout` para que el pago se pueda liquidar aunque la
   * notificación del webhook no llegue nunca (ver `src/lib/mp-settlement.ts`).
   * Solo en el proveedor MP: Stripe no lo necesita porque su suscripción se puede
   * listar en su API.
   */
  mpOrder?: { orderId: string; amount: string }
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
 * Verdad de la suscripción según Stripe, para sincronizar la fila local. El plan
 * sale de la metadata de la suscripción (escrita por el servidor, y validada
 * contra la allowlist) y los campos que no se pueden derivar se omiten en vez de
 * mandarse a null, porque `plan` no admite null.
 */
/**
 * Id de un campo expandible de Stripe: sin `expand` llega como string, y con
 * `expand` como objeto. Stripe no lo unifica, y esto es lo que evita el
 * `Type 'string | Product' is not assignable to type 'string'`.
 */
function stringIdOf(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

function syncFromStripeSub(sub: Stripe.Subscription): BillingSync {
  const plan = planFromSubscriptionMetadata(sub.metadata)
  const status = mapStripeStatus(sub.status)
  return {
    ...(plan ? { plan } : {}),
    ...(status ? { subscriptionStatus: status } : {}),
    stripeSubscriptionId: sub.id,
  }
}

/**
 * `recurring` de Stripe a partir de los días del plan (lo edita el admin en
 * /admin/plans).
 *
 * Stripe no tiene "cada N días": cobra cada `interval_count` `interval`. Se
 * traduce la duración a la unidad más grande que la divide EXACTA, para que un
 * plan de 90 días sea 3 meses y no 12 semanas y medio. Cuando los días no caen
 * en ninguna unidad exacta (45 días) se cobra cada 45 días, que es lo que el
 * admin pidió, en vez de aproximarlo a un mes y mentirle con la factura.
 *
 * El rango de la duración (1..1095 días) lo valida `src/lib/plans.ts` con el
 * mismo módulo que el resto, y su máximo es justamente el tope de periodo de
 * Stripe (tres años), así que el `interval_count` que sale de aquí nunca excede lo
 * que la API acepta.
 */
function stripeRecurring(days: number): {
  interval: StripeInterval
  interval_count: number
} {
  const unit = stripeIntervalUnit(days)
  const unitDays = { year: 365, month: 30, week: 7, day: 1 }[unit]
  return {
    interval: unit,
    interval_count: Math.max(1, Math.floor(days / unitDays)),
  }
}

/** Unidad de Stripe que divide exactamente la duración (la más grande posible). */
type StripeInterval = "day" | "week" | "month" | "year"

function stripeIntervalUnit(days: number): StripeInterval {
  if (days % 365 === 0) return "year"
  if (days % 30 === 0) return "month"
  if (days % 7 === 0) return "week"
  return "day"
}

/**
 * `price_data` inline del checkout: el importe sale de la fila `Plan` y se lo
 * mandamos a Stripe en la propia sesión, así que no hay ningún Price object ni
 * ninguna variable de entorno de por medio. Cada compra genera un Price propio
 * (los Prices son inmutables y no se pueden reutilizar con otro importe), que es
 * el precio de que el precio se administre desde el panel.
 *
 * `product` es obligatorio en Stripe: sin él se genera un Product efímero con el
 * nombre del plan, que funciona pero deja Products basura en el panel, así que
 * el admin lo rellena una vez en `Plan.stripeProductId`.
 */
function stripeLineItem(args: {
  productId: string | null
  name: string
  unitAmount: number
  /** Días del plan: el periodo con el que se cobra la suscripción. */
  durationDays: number
}): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: args.unitAmount,
      recurring: stripeRecurring(args.durationDays),
      ...(args.productId
        ? { product: args.productId }
        : { product_data: { name: args.name } }),
    },
  }
}

async function stripeCheckoutUrl(args: {

  user: BillingUser
  plan: PaidPlan
  billingUrl: string
  locale: "es" | "en"
}): Promise<CheckoutResult> {
  if (!stripe) throw new BillingError("stripe_not_configured", 503)
  // El importe se lee de la fila del plan, nunca del cuerpo de la petición: el
  // `plan` llega del cliente pero ya validado contra `PAID_PLANS`. Si el admin
  // desactivó el plan o le dejó el precio a null, no se vende.
  const unitAmount = await getPlanPrice(args.plan, "stripe")
  if (unitAmount === null) throw new BillingError("plan_unavailable", 503)
  const product = await getPlanStripeProduct(args.plan)
  if (!product) throw new BillingError("plan_unavailable", 503)
  // El periodo de la suscripción sale de la fila del plan, como el importe.
  const durationDays = await getPlanDurationDays(args.plan)

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
    line_items: [
      stripeLineItem({
        productId: product.productId,
        name: product.name,
        unitAmount,
        durationDays,
      }),
    ],
    metadata: { userId: args.user.id, plan: args.plan },
    /*
     * El plan va TAMBIÉN en la metadata de la suscripción, y no solo en la de la
     * sesión: es de la suscripción de donde lo lee el webhook para conceder el
     * plan, y no es algo en lo que se pueda apoyar que Stripe copie una en otra
     * (aquí no ocurre: la suscripción que había en la cuenta de pruebas tiene
     * `metadata: {}`).
     */
    subscription_data: {
      metadata: { userId: args.user.id, plan: args.plan },
    },
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
 * A diferencia de Stripe, aquí no hay "alta" ni "suscripción": cada pago da los
 * `durationDays` del plan (lo edita el admin en /admin/plans) de acceso y el
 * siguiente ciclo vuelve a pasar por aquí. Por eso no se bloquea el checkout
 * cuando el usuario ya está ACTIVE: eso es exactamente lo que hace un usuario
 * renovando.
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

  // La fila del plan: de aquí salen el importe y el título del producto, y nunca
  // del cuerpo de la petición.
  const plan = await getPlan(args.plan)
  if (!plan) throw new BillingError("plan_unavailable", 503)
  const durationDays = planDurationDaysOf(plan.durationDays)

  // El importe sale de la fila del plan (nunca del cuerpo de la petición) y
  // `formatMpAmount` solo lo formatea con los decimales que admite la moneda de
  // la cuenta. Sin precio para MP, el plan no se vende por aquí.
  const minor = await getPlanPrice(args.plan, "mp")
  const amount = minor === null ? null : formatMpAmount(minor)
  if (!amount) throw new BillingError("plan_unavailable", 503)

  /*
   * While the paid period is alive, no new order opens: paying twice in a row
   * would be paying for two periods. It is a soft guard (409), not a redirect to
   * a portal, because MP has no portal: the user simply renews when the period
   * runs out.
   *
   * El periodo que se comprueba es el del plan que el usuario tiene AHORA (el que
   * pagó), no el del plan que intenta comprar: si renueva antes de tiempo, el plan
   * nuevo se paga cuando el actual caduque.
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
    const currentDays = await getPlanDurationDays(args.user.plan)
    const periodMs = currentDays * 24 * 60 * 60 * 1000
    if (chargedAt.getTime() + periodMs > Date.now()) {
      throw new BillingError("mp_period_active", 409)
    }
  }

  const { orderId, checkoutUrl } = await createMpCheckoutOrder({
    plan: args.plan,
    amount,
    userId: args.user.id,
    title: mpItemTitle(plan, durationDays),
    returnUrl: args.billingUrl,
  })

  // La order nace `created`: todavía no se ha pagado nada, así que NO se toca la
  // fila del usuario. El plan lo concede quien liquide la order: el webhook
  // `order` o, si la notificación no llegó, la página de facturación.
  // El id vuelve en el resultado para que la ruta lo registre: sin guardarlo, un
  // pago que el webhook no alcanzó a ver sería irrecuperable (a MP no se le
  // pueden listar los pagos de un usuario).
  console.error(`mercadopago: order ${orderId} creada para el checkout`)
  return { url: checkoutUrl, kind: "checkout", mpOrder: { orderId, amount } }
}

/**
 * Nombre del producto que ve el pagador en la página de MP: el nombre del plan y
 * su duración, los dos de la fila que edita el admin en /admin/plans.
 *
 * Antes era un mapa hardcodeado por plan ("PRO (30 días)"), que se quedaba viejo
 * en cuanto el admin cambiaba el nombre o la duración, y obligaba a tocar el
 * código para renombrar un producto. Se usa `nameEs` porque es el idioma del
 * texto de MP en este modelo (y lo que ya se pintaba).
 */
function mpItemTitle(plan: PlanRow, durationDays: number): string {
  return `GameVault ${plan.nameEs || plan.slug} (${durationDays} días)`
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
  if (!stripe) throw new BillingError("stripe_not_configured", 503)
  if (!args.user.stripeSubscriptionId) {
    throw new BillingError("no_active_subscription", 409)
  }
  const unitAmount = await getPlanPrice(args.plan, "stripe")
  if (unitAmount === null) throw new BillingError("plan_unavailable", 503)
  const product = await getPlanStripeProduct(args.plan)
  if (!product) throw new BillingError("plan_unavailable", 503)
  // El periodo de la suscripción sale de la fila del plan, como el importe.
  const durationDays = await getPlanDurationDays(args.plan)

  const current = await stripe.subscriptions.retrieve(
    args.user.stripeSubscriptionId,
  )
  const item = current.items?.data?.[0]
  if (!item) throw new BillingError("subscription_not_updatable", 409)
  if (planFromSubscriptionMetadata(current.metadata) === args.plan) {
    throw new BillingError("already_active", 409)
  }

  /*
   * A diferencia del checkout, aquí `price_data.product` es OBLIGATORIO y no
   * admite `product_data`: no hay un producto efímero que inventar. Se usa el que
   * declara el plan y, si el admin aún no lo ha rellenado, el producto del Price
   * que la suscripción ya tiene — que es un producto que la cuenta ya posee y que
   * además es el correcto: la suscripción se queda en su producto y solo cambia
   * el importe.
   */
  const productId = product.productId ?? stringIdOf(item.price?.product)
  if (!productId) throw new BillingError("plan_unavailable", 503)

  const priceData: Stripe.SubscriptionItemUpdateParams.PriceData = {
    currency: "usd",
    product: productId,
    unit_amount: unitAmount,
    /*
     * El periodo del item pasa a ser el del plan nuevo, no el que tuviera la
     * suscripción: cambiar de plan es cambiar de producto, y si el admin ha
     * redefinido la duración (de 30 a 90 días) la factura siguiente tiene que
     * respetarla. Es el mismo `recurring` que genera el checkout, para que
     * "suscribirse" y "mejorar" no puedan cobrar periodos distintos.
     */
    recurring: stripeRecurring(durationDays),
  }

  let updated
  try {
    updated = await stripe.subscriptions.update(args.user.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: 1, price_data: priceData }],
      proration_behavior: "always_invoice",
      /*
       * El plan viaja en la metadata de la suscripción, así que al mejorarla hay
       * que actualizarla en el MISMO update. Si no, el `customer.subscription.updated`
       * que dispara este cambio leería el plan viejo y dejaría al usuario en el
       * plan anterior con la factura ya cobrada.
       */
      metadata: { userId: args.user.id, plan: args.plan },
    })
  } catch (error) {
    // El detalle (motivo del rechazo, código de tarjeta) solo a consola.
    console.error("[payments:upgrade] stripe subscriptions.update:", error)
    if (stripeErrorType(error) === "StripeCardError") {
      throw new BillingError("card_error", 402)
    }
    throw new BillingError("subscription_not_updatable", 409)
  }

  // El plan se relee de la metadata REAL devuelta por Stripe (autoritativo) y no
  // del slug que nos pidieron: es el mismo criterio que usa el webhook.
  const confirmed = planFromSubscriptionMetadata(updated.metadata)
  if (!confirmed) {
    console.error("[payments:upgrade] metadata sin plan tras el upgrade")
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