import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { prisma } from "@/lib/db"
import {
  mapStripeStatus,
  stripe,
  type StripeSubscriptionStatus,
} from "@/lib/stripe"
import { planFromSubscriptionMetadata, TIER_RANK } from "@/lib/billing"
import { recordPayment } from "@/lib/payment-history"
import { getPlanDurationDays } from "@/lib/plans"

export const dynamic = "force-dynamic"

/*
 * El webhook es el punto de entrada de Stripe para sincronizar el estado de
 * suscripciones. Medidas de seguridad:
 *  - No depende de sesión: se autentica por la firma `stripe-signature`
 *    verificada con STRIPE_WEBHOOK_SECRET sobre el body crudo.
 *  - El plan SIEMPRE se deriva de la metadata de la suscripción real en Stripe
 *    (autoritativo, y escrita por el servidor), nunca de inputs del cliente. La
 *    metadata se contrasta contra la allowlist de `PAID_PLANS` como cualquier
 *    otro dato externo.
 *  - Idempotente: re-ejecutar un evento no cambia el estado más allá de lo
 *    esperado.
 *  - En checkout se aplica una "guardia de rango": jamás degrada a un plan
 *    en curso si los eventos llegan reordenados/retry.
 *  - Una suscripción SIN plan en la metadata no degrada a nadie: solo se actualiza
 *    el estado. Antes, no reconocer el price escribía `plan: FREE` sobre un
 *    suscriptor que sí estaba pagando.
 *  - Tras un upgrade (POST /api/billing/upgrade) el plan de la suscripción ya
 *    viene cambiado: `customer.subscription.updated` es quien consolida el plan,
 *    sin ninguna lógica especial de "me han subido de nivel".
 *  - `invoice.paid` escribe el historial de pagos (`Payment`) y nada más: el plan
 *    y el estado los llevan los eventos de suscripción, para que un evento del
 *    dinero no pueda degradar a un suscriptor.
 */

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null
  return typeof customer === "string" ? customer : customer.id
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  if (!userId) return

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return

  const subRef = session.subscription
  const sub: Stripe.Subscription | null =
    typeof subRef === "string"
      ? await stripe!.subscriptions.retrieve(subRef)
      : (subRef ?? null)
  const subId = sub?.id ?? (typeof subRef === "string" ? subRef : null)

  // El plan se lee de la suscripción (la metadata la escribe el checkout) y se
  // contrasta con el que pidió la sesión: si los dos no coinciden, el evento se
  // ignora en lugar de conceder una de las dos cosas.
  const subPlan = sub ? planFromSubscriptionMetadata(sub.metadata) : null
  const sessionPlan = planFromSubscriptionMetadata(session.metadata ?? {})
  const plan = subPlan ?? sessionPlan
  if (!plan) {
    console.error(
      "[stripe:webhook] checkout completado sin plan en la metadata:",
      session.id,
    )
    return
  }
  if (subPlan && sessionPlan && subPlan !== sessionPlan) {
    console.error(
      "[stripe:webhook] metadata de sesión y suscripción no coinciden, ignorado:",
      session.id,
    )
    return
  }
  if (!subId) return

  // Guardia de rango: no degradar por eventos reordenados o reintentos.
  if (TIER_RANK[plan] < TIER_RANK[user.plan]) return

  const data: {
    plan: "PRO" | "COLLECTOR"
    subscriptionStatus: StripeSubscriptionStatus
    stripeSubscriptionId: string | null
    stripeCustomerId?: string
  } = {
    plan,
    subscriptionStatus:
      session.payment_status === "paid" ? "ACTIVE" : "INACTIVE",
    stripeSubscriptionId: subId,
  }
  const customerId = customerIdOf(session.customer)
  if (customerId) data.stripeCustomerId = customerId

  await prisma.user.update({ where: { id: user.id }, data })
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerIdOf(sub.customer) ?? "" },
  })
  if (!user) return

  const plan = planFromSubscriptionMetadata(sub.metadata)
  const status = mapStripeStatus(sub.status)

  if (!status) return

  /*
   * Sin plan en la metadata NO se degrada a FREE: se actualiza solo el estado y
   * el `stripeSubscriptionId`. Es el caso de las suscripciones creadas antes de
   * que el plan viajara en la metadata, y escribirlas a FREE era exactamente el
   * bug de "paga pero no tiene plan". Quien cancela entra por
   * `customer.subscription.deleted`, que sí baja a FREE.
   */
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(plan ? { plan } : {}),
      subscriptionStatus: status,
      stripeSubscriptionId: sub.id,
    },
  })
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerIdOf(sub.customer) ?? "" },
  })
  if (!user) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: "FREE",
      subscriptionStatus: "CANCELED",
      stripeSubscriptionId: null,
    },
  })
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerIdOf(invoice.customer) ?? "" },
  })
  if (!user || !user.stripeSubscriptionId) return

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: "PAST_DUE" },
  })
}

/**
 * Un pago cobrado de una suscripción, para el historial de `/app/billing`.
 *
 * `invoice.paid` es el evento DEL DINERO: `checkout.session.completed` solo dice
 * que se abrió la sesión de pago (y las renovaciones no pasan por ahí), así que
 * sin esto la tabla `Payment` solo tendría las compras de MP.
 *
 * Solo escribe la fila del historial: NO toca ni el plan ni el estado de la
 * suscripción, de eso ya se encargan `handleCheckoutCompleted` y
 * `handleSubscriptionUpdated`. Mezclar las dos cosas en un evento reintroduce
 * exactamente los bugs de eventos reordenados que el webhook ya evita.
 *
 * El plan sale de la metadata de la suscripción que generó la factura, que
 * Stripe entrega como FOTO inmutable en `parent.subscription_details.metadata`
 * (escrita por el servidor en el checkout) y se contrasta con la misma
 * allowlist que el resto del webhook. Una factura sin suscripción (un cobro
 * suelto que la app no genera) no tiene plan que registrar y se ignora.
 */
async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventCreated: number,
) {
  const details = invoice.parent?.subscription_details
  if (!details) {
    console.error(
      "[stripe:webhook] factura pagada sin suscripción de origen:",
      invoice.id,
    )
    return
  }

  const plan = planFromSubscriptionMetadata(details.metadata ?? {})
  if (!plan) {
    console.error(
      "[stripe:webhook] factura pagada sin plan en la metadata:",
      invoice.id,
    )
    return
  }

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerIdOf(invoice.customer) ?? "" },
  })
  if (!user) {
    // Cobro sin dueño local: se dice en consola porque en silencio parece un
    // bug de la app cuando en realidad es una fila nuestra que no tiene el
    // `stripeCustomerId` (p. ej. el checkout se creó y el cliente no se guardó).
    console.error(
      "[stripe:webhook] factura pagada de un customer sin usuario:",
      invoice.id,
    )
    return
  }

  // Una factura de 0 (prorrateo a la baja, cupón de 100%) no es un pago: se
  // guarda tal cual y el historial mentiría con un importe de 0.
  if (!Number.isInteger(invoice.amount_paid) || invoice.amount_paid <= 0) return

  const paidAtSec = invoice.status_transitions?.paid_at ?? eventCreated
  const paidAt = new Date(paidAtSec * 1000)
  if (Number.isNaN(paidAt.getTime())) return

  await recordPayment({
    userId: user.id,
    provider: "stripe",
    // La factura, no la sesión ni la suscripción: cada periodo que se cobra es
    // una factura distinta, y es lo que hace única la fila de cada cobro.
    externalId: invoice.id,
    plan,
    amountMinor: invoice.amount_paid,
    currency: invoice.currency,
    // Duración del periodo que pagó el plan en la BD. Es la misma regla que en MP
    // (el plan en el momento del cobro): si el admin cambiase la duración entre
    // un cobro y otro, la foto de cada pago refleja lo que valía entonces.
    durationDays: await getPlanDurationDays(plan),
    paidAt,
  })
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !stripe) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    )
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 })
  }

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (error) {
    console.error("[stripe:webhook] firma inválida:", error)
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 })
  }

  const handlers: Partial<Record<Stripe.Event["type"], () => Promise<void>>> = {
    "checkout.session.completed": () =>
      handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session),
    "customer.subscription.updated": () =>
      handleSubscriptionUpdated(event.data.object as Stripe.Subscription),
    "customer.subscription.deleted": () =>
      handleSubscriptionDeleted(event.data.object as Stripe.Subscription),
    "invoice.payment_failed": () =>
      handlePaymentFailed(event.data.object as Stripe.Invoice),
    "invoice.paid": () =>
      handleInvoicePaid(event.data.object as Stripe.Invoice, event.created),
  }

  const handler = handlers[event.type]
  if (handler) {
    try {
      await handler()
    } catch (error) {
      console.error(`[stripe:webhook] error en ${event.type}:`, error)
      return NextResponse.json({ error: "handler_failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}