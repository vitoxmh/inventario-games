import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import {
  activeProviderFor,
  billingReturnUrl,
  isPaidPlanSlug,
  isUpgrade,
} from "@/lib/billing"
import { isProviderConfigured } from "@/lib/providers"
import { upgradePlan, BillingError } from "@/lib/payments"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/*
 * POST /api/billing/upgrade — "subir de nivel": Free -> Coleccionista -> Pro.
 *
 * Solo actúa sobre un plan YA de pago: es el camino para cuando el usuario ya
 * paga y quiere un plan superior, no el alta (esa es /api/billing/checkout).
 *
 *  - Stripe: cambia el price de la suscripción real y cobra el prorrateo de lo
 *    que falte del periodo, así que el plan entra al instante.
 *  - MP: no hay suscripción ni prorrateo. Subir de plan es pagar el plan nuevo,
 *    así que se devuelve la `checkout_url` de una order por su importe
 *    (`pending: true`); el plan entra cuando esa order se apruebe, por el mismo
 *    camino que un alta.
 *
 * Frontera de confianza (esta ruta es la que valida):
 *  - sesión obligatoria y `userId` SIEMPRE de la sesión (nunca del body);
 *  - `plan` contra la allowlist de planes de pago de la escalera;
 *  - solo subidas: un plan igual o inferior se rechaza;
 *  - el proveedor se deduce del plan del usuario, no se elige;
 *  - price/importes salen de variables de entorno del servidor.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "upgrade",
      limit: 20,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { plan?: unknown; locale?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  // El locale solo decide el idioma de la vuelta a la facturación. Va contra la
  // misma allowlist de dos valores que usan checkout y portal: nunca se
  // concatena en una URL un valor que venga del cliente sin filtrar, y la
  // URL siempre es relativa al host de la petición (nada de open redirect).
  const locale = body.locale === "en" ? "en" : "es"

  const requestedPlan = String(body.plan ?? "").toUpperCase()
  if (!isPaidPlanSlug(requestedPlan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 })
  }
  const plan = requestedPlan

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      mpLastChargeAt: true,
    },
  })
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // No es una subida (mismo plan o uno inferior): aquí no se degrada a nadie.
  if (!isUpgrade(user.plan, plan)) {
    return NextResponse.json({ error: "not_an_upgrade" }, { status: 400 })
  }
  if (user.subscriptionStatus !== "ACTIVE") {
    return NextResponse.json({ error: "no_active_subscription" }, { status: 409 })
  }

  const provider = activeProviderFor(user)
  if (!provider) {
    return NextResponse.json({ error: "no_active_subscription" }, { status: 409 })
  }
  // El upgrade es de quien ya está suscrito, así que el interruptor del admin
  // no se mira (apagar un medio de pago no puede dejar a un cliente sin forma
  // de subir de plan). Solo se exige que el proveedor siga configurado.
  if (!isProviderConfigured(provider)) {
    return NextResponse.json(
      { error: "provider_not_available" },
      { status: 503 },
    )
  }

  try {
    const result = await upgradePlan({
      provider,
      user,
      plan,
      // La vuelta la decide el servidor (URL pública configurada), no el `Host`
      // que envíe el cliente: ver `billingReturnUrl`.
      billingUrl: billingReturnUrl(locale, request.url),
    })

    // Solo se escribe lo que el proveedor ha confirmado: con Stripe, el plan y el
    // estado de la suscripción real. Con MP no se toca la fila hasta que la
    // order esté pagada.
    if (result.plan && result.status) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: result.plan,
          subscriptionStatus: result.status,
        },
      })
    }

    return NextResponse.json({
      url: result.url,
      pending: result.pending,
      plan: result.plan,
    })
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      )
    }
    console.error("billing/upgrade:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}
