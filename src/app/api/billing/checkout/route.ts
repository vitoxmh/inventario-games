import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { billingReturnUrl, isPaidPlanSlug } from "@/lib/billing"
import { getAvailableProviders } from "@/lib/payment-providers"
import { isProvider } from "@/lib/providers"
import { checkoutUrl, BillingError } from "@/lib/payments"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

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
  if (!isPaidPlanSlug(requestedPlan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 })
  }
  const plan = requestedPlan

  // El proveedor se valida contra la allowlist y además contra el interruptor
  // del admin: un proveedor apagado (o sin credenciales) no abre checkout, por
  // mucho que el cliente lo pida.
  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 })
  }
  const provider = body.provider
  const available = await getAvailableProviders()
  if (!available.includes(provider)) {
    return NextResponse.json(
      { error: "provider_not_available" },
      { status: 503 },
    )
  }

  const locale = body.locale === "en" ? "en" : "es"

  // A dónde vuelve el usuario desde el checkout del proveedor. En MP es la
  // misma URL para aprobado, rechazado y pendiente: de ella solo se saca el
  // mensaje, el estado real se repregunta a la API de MP. La URL la decide el
  // servidor (URL pública configurada), no el `Host` que envíe el cliente.
  const billingUrl = billingReturnUrl(locale, request.url)

  // El `userId` sale de la sesión, nunca del body: el plan se compra para quien
  // está autenticado.
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

  try {
    const result = await checkoutUrl({
      provider,
      user,
      plan,
      billingUrl,
      locale,
    })

    // Lo único que el proveedor ha confirmado y que hay que persistir es el
    // customer de Stripe. Con MP no se escribe nada: la order aún no está pagada
    // y su estado lo reconcilia el webhook `order` (que a su vez repregunta a la
    // API de MP). Los query params de la return URL solo pintan el mensaje.
    //
    // `sync` es lo contrario: cuando el proveedor sí tiene una suscripción viva
    // pero nuestra fila aún no lo sabe (porque el webhook no ha llegado), aquí se
    // corrige la fila con la verdad de Stripe. Así el plan no depende en exclusiva
    // del webhook para dejar de ofrecer una compra duplicada.
    const data: Record<string, unknown> = {}
    if (typeof result.stripeCustomerId === "string")
      data.stripeCustomerId = result.stripeCustomerId
    if (result.sync) Object.assign(data, result.sync)
    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data })
    }

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
