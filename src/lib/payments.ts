import "server-only"
import { stripe } from "@/lib/stripe"
import { priceIdForPlan } from "@/lib/billing"
import {
  createMpPreapprovalUrl,
  isMpConfigured,
  type MpPlan,
} from "@/lib/mp"

export type PaidPlan = "PRO" | "COLLECTOR"

export type BillingUser = {
  id: string
  email: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  mpPreapprovalId: string | null
  mpPreapprovalPlanId: string | null
}

export type Provider = "stripe" | "mp"

export type CheckoutResult = {
  url: string
  kind: "checkout" | "portal"
  // En el flujo MP, el id de la preapproval creada (para perseguirlo antes
  // de que el usuario autorice el pago y poder resolver el webhook).
  pendingPreapprovalId?: string
  stripeCustomerId?: string
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

async function mpCheckoutUrl(args: {
  user: BillingUser
  plan: PaidPlan
  billingUrl: string
}): Promise<CheckoutResult> {
  if (!isMpConfigured()) throw new BillingError("mp_not_configured", 503)

  // Con una suscripción activa en cualquier proveedor, no crear otra en MP
  // (evita duplicados entre proveedores).
  if (args.user.subscriptionStatus === "ACTIVE") {
    throw new BillingError("already_active", 409)
  }

  const origin = new URL(args.billingUrl).origin
  const result = await createMpPreapprovalUrl({
    userId: args.user.id,
    email: args.user.email,
    plan: args.plan as MpPlan,
    reason: `GameVault ${args.plan}`,
    origin,
    successPath: "/es/app/billing",
  })

  return {
    url: result.url,
    kind: "checkout",
    pendingPreapprovalId: result.preapprovalId,
  }
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

export async function portalUrl(args: {
  provider: Provider
  customerId: string
  billingUrl: string
}): Promise<string> {
  if (args.provider !== "stripe") {
    // MP no expone un portal de autogestión: la cancelación se hace desde
    // el panel de MP o contactando soporte.
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