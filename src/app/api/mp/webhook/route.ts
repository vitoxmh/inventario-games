import { NextResponse } from "next/server"
import { isValidMpOrderId, verifyMpSignature } from "@/lib/mp"
import { settleMpCheckout } from "@/lib/mp-settlement"

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
 *  - Identidad (IDOR): la fila se busca por el `userId` que va dentro del
 *    `external_reference` de la order, un valor que generamos nosotros y que
 *    pasa por la allowlist de planes.
 *
 * La notificación solo es un aviso de "algo cambió, ven a mirar". Qué hacer con
 * la order (conceder, renovar, degradar o no tocar nada) lo decide
 * `settleMpCheckout`, que repregunta a la API de MP y es la MISMA función que
 * usa la página de facturación para liquidar las orders que esta notificación no
 * alcanzó a resolver. La lógica de dinero vive una sola vez, en `src/lib`.
 *
 * Idempotente: MP reenvía las notificaciones y estas pueden llegar desordenadas;
 * repetir un evento converge al mismo estado.
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

  // La firma ya está comprobada y el id tiene forma de order: a partir de aquí la
  // repregunta a MP es lo que decide. Un `lookup_failed` se devuelve como 502
  // para que MP reintiente la entrega en vez de darla por buena.
  const settlement = await settleMpCheckout(dataId)
  if (settlement.outcome === "lookup_failed") {
    return NextResponse.json({ error: "order_lookup_failed" }, { status: 502 })
  }
  return NextResponse.json({ received: true })
}
