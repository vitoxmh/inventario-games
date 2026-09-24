import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getEnabledProviders, type Provider } from "@/lib/billing"
import { portalUrl, BillingError } from "@/lib/payments"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "portal",
      limit: 20,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { provider?: unknown; locale?: unknown }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const locale = body.locale === "en" ? "en" : "es"
  const provider = String(body.provider ?? "") as Provider

  if (!getEnabledProviders().includes(provider)) {
    return NextResponse.json(
      { error: "provider_not_available" },
      { status: 503 },
    )
  }

  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  const billingUrl = `${origin}/${locale}/app/billing`

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 })
  }

  try {
    const portal = await portalUrl({
      provider,
      customerId: user.stripeCustomerId,
      billingUrl,
    })
    return NextResponse.json({ url: portal })
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      )
    }
    console.error("billing/portal:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}