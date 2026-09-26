import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { billingReturnUrl } from "@/lib/billing"
import { isProvider, isProviderConfigured } from "@/lib/providers"
import { cancelMpSubscription, portalUrl, BillingError } from "@/lib/payments"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/*
 * POST /api/billing/portal — autogestión de la suscripción, por proveedor:
 *  - Stripe: devuelve la URL de su portal de cliente.
 *  - MP: no hay portal ni tarjeta guardada, así que "gestionar" es cancelar. No
 *    hay nada que cancelar en MP (nadie cobra solo) y el plan vuelve a FREE.
 *
 * El interruptor del admin no se mira: apagar un medio de pago no debe dejar a
 * quien ya paga sin poder cancelar ni actualizar su tarjeta. Solo se exige que
 * el proveedor siga configurado.
 */
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

  if (!isProvider(body.provider) || !isProviderConfigured(body.provider)) {
    return NextResponse.json(
      { error: "provider_not_available" },
      { status: 503 },
    )
  }
  const provider = body.provider

  // La vuelta la decide el servidor (URL pública configurada), no el `Host` que
  // envíe el cliente: ver `billingReturnUrl`.
  const billingUrl = billingReturnUrl(locale, request.url)

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    if (provider === "mp") {
      // Cancelar aquí solo significa "no me cobres el mes que viene": MP no tiene
      // nada que dar de baja porque no se guarda tarjeta ni hay cobro
      // programado. Se suelta el ancla del periodo para que el panel de admin no
      // siga mostrando un plan pagado como si lo estuviera. El `userId` sale de
      // la sesión, nunca del body.
      cancelMpSubscription()
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          plan: "FREE",
          subscriptionStatus: "CANCELED",
          mpLastChargeAt: null,
        },
      })
      return NextResponse.json({ url: billingUrl })
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "no_customer" }, { status: 400 })
    }

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
