import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  getMpOrder,
  isValidMpOrderId,
  mpOrderOutcome,
  parseMpExternalReference,
  verifyMpSignature,
  type MpOrder,
} from "@/lib/mp"
import { isPaidPlanSlug, TIER_RANK } from "@/lib/billing"

export const dynamic = "force-dynamic"

/*
 * Webhook de Mercado Pago para Checkout Pro (Orders API).
 *
 * Un solo tópico: `order` (se creó o actualizó una order de pago). No hay
 * `payment_profile` porque en este modelo no se guarda tarjeta.
 *
 * Seguridad (esto es una puerta de escritura, se exige todo):
 *  - Firma HMAC: `x-signature` + `x-request-id` verificados contra
 *    `MP_WEBHOOK_SECRET` por el `WebhookSignatureValidator` del SDK. Sin secret
 *    configurado no se procesa nada.
 *  - Cross-check: el estado NUNCA se toma del evento. Se repregunta a la API de
 *    MP (`order.get` del SDK, `GET /v1/orders/{id}`) y es esa respuesta la que
 *    manda, tal como recomienda MP.
 *  - Identidad (IDOR): la fila se busca por el `userId` que va dentro del
 *    `external_reference` de la order, un valor que generamos nosotros y que
 *    pasa por la allowlist de planes.
 *  - Guardia de rango: un pago de un plan INFERIOR al que ya tiene no degrada.
 *  - Idempotente: MP reenvía las notificaciones y estas pueden llegar
 *    desordenadas; repetir un evento converge al mismo estado.
 */

export async function POST(request: Request) {
  if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "mp_not_configured" },
      { status: 503 },
    )
  }

  const url = new URL(request.url)
  const type = url.searchParams.get("type")
  const dataId = url.searchParams.get("data.id") ?? ""

  // Tópicos no relacionados: se ignoran sin procesar (y sin exigir firma).
  if (type !== "order") {
    return NextResponse.json({ received: true })
  }
  if (!dataId) {
    return NextResponse.json({ received: true })
  }
  // El `data.id` viene del query param de una petición que puede forjar
  // cualquiera, así que su formato se valida antes de meterlo en el path de la
  // API. Un id que no es una order nuestra se ignora en silencio (y no puede
  // pasar la firma de todas formas).
  if (!isValidMpOrderId(dataId)) {
    console.error("mercadopago: data.id con formato inesperado")
    return NextResponse.json({ received: true })
  }

  if (!verifyMpSignature(request, dataId)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  return handleOrder(dataId)
}

/**
 * Replica en la BD lo que la order REAL dice:
 *  - pagada  -> ACTIVE, plan de la order y `mpLastChargeAt` = ahora (empieza el
 *    periodo de `MP_BILLING_PERIOD_DAYS`). No hay nada que reservar para el
 *    siguiente ciclo: el usuario vuelve a pagar.
 *  - muerta (rechazada, cancelada o reembolsada) -> PAST_DUE conservando el
 *    plan. `mpLastChargeAt` NO se toca: el periodo en curso ya se pagó y sigue
 *    hasta su fecha, y es el barrido diario quien lo degradará al vencer.
 */
async function handleOrder(dataId: string) {
  let order: MpOrder
  try {
    order = await getMpOrder(dataId)
  } catch (error) {
    console.error("[mp:webhook] no se pudo leer la order:", error)
    return NextResponse.json({ error: "order_lookup_failed" }, { status: 502 })
  }

  // `external_reference` es lo único que MP nos devuelve de la order y es
  // nuestro: sin él (o con un plan fuera de la escalera) no es una order nuestra.
  const reference = parseMpExternalReference(order.external_reference)
  if (!reference || !isPaidPlanSlug(reference.plan)) {
    // Silencioso para quien llama, pero no mudo: si la referencia no vuelve
    // intacta, el plan no se concede nunca y sin esta línea no hay forma de
    // distinguirlo de "el webhook no llegó".
    console.error(
      `[mp:webhook] order ${dataId} con external_reference inesperado:`,
      order.external_reference,
    )
    return NextResponse.json({ received: true })
  }

  // La fila se busca por el id que va dentro del `external_reference`, nunca por
  // un id que venga de la notificación.
  const user = await prisma.user.findUnique({
    where: { id: reference.userId },
    select: { id: true, plan: true },
  })
  if (!user) {
    return NextResponse.json({ received: true })
  }

  const plan = reference.plan
  const outcome = mpOrderOutcome(order)

  if (outcome === "paid") {
    // Un pago de un plan INFERIOR al que ya tiene (una orden vieja que llegó
    // tarde) no degrada: solo se renueva su periodo.
    if (TIER_RANK[plan] < TIER_RANK[user.plan]) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mpLastChargeAt: new Date() },
      })
      return NextResponse.json({ received: true })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        subscriptionStatus: "ACTIVE",
        mpLastChargeAt: new Date(),
      },
    })
    return NextResponse.json({ received: true })
  }

  if (outcome === "dead") {
    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: "PAST_DUE" },
    })
    return NextResponse.json({ received: true })
  }

  // `pending` o `unknown`: no se toca nada. Un pago en revisión puede acabar
  // acreditándose, y degradar aquí dejaría al usuario sin lo que pagó. Se
  // registra el desenlace porque desde fuera es indistinguible de "no llegó".
  console.error(
    `[mp:webhook] order ${dataId} sin conceder plan: estado "${outcome}"`,
  )
  return NextResponse.json({ received: true })
}
