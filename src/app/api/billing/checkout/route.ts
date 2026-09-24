import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import {
  getEnabledProviders,
  type Provider,
} from "@/lib/billing"
import { checkoutUrl, BillingError } from "@/lib/payments"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const PAID_PLANS = ["PRO", "COLLECTOR"] as const

type BillingUserRow = {
  id: string
  email: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  mpPreapprovalId: string | null
  mpPreapprovalPlanId: string | null
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "checkout",
      limit: 20,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { plan?: unknown; provider?: unknown; locale?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const requestedPlan = String(body.plan ?? "").toUpperCase()
  if (!(PAID_PLANS as readonly string[]).includes(requestedPlan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 })
  }
  const plan = requestedPlan as (typeof PAID_PLANS)[number]

  const provider = String(body.provider ?? "") as Provider
  const enabled = getEnabledProviders()
  if (!enabled.includes(provider)) {
    return NextResponse.json(
      { error: "provider_not_available" },
      { status: 503 },
    )
  }

  const locale = body.locale === "en" ? "en" : "es"
  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  const billingUrl = `${origin}/${locale}/app/billing`

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      mpPreapprovalId: true,
      mpPreapprovalPlanId: true,
    },
  })
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const result = await checkoutUrl({
      provider,
      user: user as BillingUserRow,
      plan,
      billingUrl,
      locale,
    })

    const data: { stripeCustomerId?: string } = {}
    if (typeof result.stripeCustomerId === "string") {
      data.stripeCustomerId = result.stripeCustomerId
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...data,
        // El id de la preapproval se guarda antes de la autorización para
        // poder resolver el webhook aunque el cliente tarde en pagar.
        ...(result.pendingPreapprovalId
          ? { mpPreapprovalId: result.pendingPreapprovalId }
          : {}),
      },
    })

    return NextResponse.json({ url: result.url })
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      )
    }
    console.error("billing/checkout:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}