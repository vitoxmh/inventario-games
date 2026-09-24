import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { prisma } from "@/lib/db"
import { stripe } from "@/lib/stripe"
import { planFromPriceId, TIER_RANK } from "@/lib/billing"

export const dynamic = "force-dynamic"

/*
 * El webhook es el punto de entrada de Stripe para sincronizar el estado de
 * suscripciones. Medidas de seguridad:
 *  - No depende de sesión: se autentica por la firma `stripe-signature`
 *    verificada con STRIPE_WEBHOOK_SECRET sobre el body crudo.
 *  - El plan SIEMPRE se deriva del price id real de la suscripción en
 *    Stripe (autoritativo), nunca de inputs del cliente.
 *  - Idempotente: re-ejecutar un evento no cambia el estado más allá de lo
 *    esperado.
 *  - En checkout se aplica una "guardia de rango": jamás degrada a un plan
 *    en curso si los eventos llegan reordenados/retry.
 */

type StripeStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "TRIALING"

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status,
): StripeStatus | null {
  switch (status) {
    case "active":
      return "ACTIVE"
    case "past_due":
      return "PAST_DUE"
    case "canceled":
    case "unpaid":
      return "CANCELED"
    case "trialing":
      return "TRIALING"
    case "paused":
    case "incomplete":
    case "incomplete_expired":
      return "INACTIVE"
    default:
      return null
  }
}

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null
  return typeof customer === "string" ? customer : customer.id
}

async function priceOfSubscription(
  subscriptionId: string | Stripe.Subscription | null,
): Promise<{ priceId: string; plan: "PRO" | "COLLECTOR" | null } | null> {
  const sub =
    typeof subscriptionId === "object"
      ? subscriptionId
      : subscriptionId
        ? await stripe!.subscriptions.retrieve(subscriptionId)
        : null
  const priceId = sub?.items?.data?.[0]?.price?.id
  if (!priceId) return null
  return { priceId, plan: planFromPriceId(priceId) }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  if (!userId) return

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return

  const subscription = await priceOfSubscription(session.subscription)
  const metadataPlan = session.metadata?.plan
  if (!subscription || !subscription.plan) {
    console.error(
      "[stripe:webhook] checkout completado sin price válido:",
      session.id,
    )
    return
  }
  // Cross-check: el price real debe corresponder al plan que pedimos crear.
  if (subscription.plan !== metadataPlan) {
    console.error(
      "[stripe:webhook] priceId/metadata no coinciden, ignorado:",
      session.id,
    )
    return
  }
  // Guardia de rango: no degradar por eventos reordenados o reintentos.
  if (TIER_RANK[subscription.plan] < TIER_RANK[user.plan]) return

  const data: {
    plan: "PRO" | "COLLECTOR"
    subscriptionStatus: StripeStatus
    stripeSubscriptionId: string | null
    stripeCustomerId?: string
  } = {
    plan: subscription.plan,
    subscriptionStatus:
      session.payment_status === "paid"
        ? "ACTIVE"
        : "INACTIVE",
    stripeSubscriptionId:
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription?.id ?? null),
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

  const priceId = sub.items?.data?.[0]?.price?.id
  const plan = priceId ? planFromPriceId(priceId) : null
  const status = mapSubscriptionStatus(sub.status)

  if (!status) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: plan ?? "FREE",
      subscriptionStatus: status,
      stripeSubscriptionId: plan ? sub.id : null,
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