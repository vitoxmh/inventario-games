import "server-only"
import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Order,
  WebhookSignatureValidator,
} from "mercadopago"
import type { PaidPlan } from "@/lib/billing"
import { isProviderConfigured } from "@/lib/providers"

/*
 * Mercado Pago con el SDK oficial de Node (`mercadopago`), modelo Checkout Pro
 * sobre la Orders API.
 *
 * El flujo es corto a propósito: se crea una order en `processing_mode: "manual"`
 * y MP devuelve un `checkout_url` (su hosted checkout) al que se manda al
 * usuario. Él paga allí —con tarjeta, dinero de la cuenta, Rapipago, Pago Fácil
 * o cuotas sin tarjeta— y MP lo devuelve a nuestra return URL.
 *
 * Lo que este modelo NO tiene, y hay que tener asumido:
 *  - No se guarda ninguna tarjeta. No hay customer, ni payment profile, ni
 *    `stored_credential`: nada que cobrar solo. Por eso no se monta el Card
 *    Form (Brick) ni se abre la CSP para `sdk.mercadopago.com`.
 *  - MP no agenda cobros. Cada ciclo el usuario vuelve a pagar, y el periodo
 *    pagado se ancla en `mpLastChargeAt`. El barrido diario (`/api/mp/expire`)
 *    degrada a FREE a quien lo tenga vencido.
 *  - El modelo alternativo de la doc (Automatic Payments: customer + payment
 *    profile + `processing_mode: "automatic_async"` para cobrar la tarjeta
 *    guardada) queda descartado a propósito: exige autorización comercial del
 *    equipo de Ventas de MP, así que no es autoservicio.
 *
 * Dos normas que no se negocian:
 *  - El importe SIEMPRE sale de `MP_PRICE_*` (nunca del cliente) y el plan nunca
 *    se deriva de la entrada del usuario: el `external_reference` que manda MP
 *    se contrasta contra el plan de la escalera antes de tocar la BD.
 *  - Las notificaciones nunca son la fuente de verdad: se verifica la firma y
 *    luego se pregunta a la API por el estado real (ver `src/app/api/mp/webhook`).
 *    Igual con la vuelta del usuario: los query params de la return URL solo
 *    sirven para pintar el mensaje; el estado se repregunta a MP.
 *
 * Referencia: https://www.mercadopago.cl/developers/es/docs/checkout-pro-orders/create-order
 */

export type MpPlan = PaidPlan

/**
 * Forma de una order de MP. Se deriva de la clase pública del SDK (`Order.get`)
 * en vez de importarse de `mercadopago/dist/...`: así el tipo lo mantiene quien
 * lo publica y en la app no hay ninguna ruta de importación interna ajena.
 */
export type MpOrder = Awaited<ReturnType<Order["get"]>>

/** Días de acceso que compra cada pago. Los planes son mensuales. */
export const MP_BILLING_PERIOD_DAYS = 30

/**
 * Ventana de antigüedad que se acepta en la marca de tiempo de la firma de un
 * webhook. MP reenvía las notificaciones fallidas cada 15 minutos y amplía el
 * plazo tras el tercer intento, así que la ventana tiene que ser holgada: la
 * protección real contra repeticiones no es esta ventana (los handlers son
 * idempotentes y reconsultan el estado real a MP) sino la firma HMAC.
 */
const SIGNATURE_TOLERANCE_SECONDS = 24 * 60 * 60

function accessToken(): string | null {
  return process.env.MP_ACCESS_TOKEN ?? null
}

export function isMpConfigured(): boolean {
  return isProviderConfigured("mp")
}

/**
 * Cliente de la Orders API. El SDK se inicializa una vez por proceso y se
 * cachea: cada `Order` comparte la config (token, timeout, reintentos) tal como
 * pide la documentación. Sin `MP_ACCESS_TOKEN` no hay cliente, y los llamantes
 * lo tratan como "MP no disponible" en vez de reventar.
 */
let cached: Order | null | undefined

function mpOrder(): Order | null {
  if (cached !== undefined) return cached
  const token = accessToken()
  cached = token
    ? new Order(
        new MercadoPagoConfig({
          accessToken: token,
          options: { timeout: 10_000, maxRetries: 2 },
        }),
      )
    : null
  return cached
}

/**
 * Moneda en la que MP cobra. MP NUNCA cobra en USD: cada sitio (MLC, MLA,
 * MLM, MCO...) tiene la suya, así que el importe que se muestra al usuario tiene
 * que ser el de esta, no el precio en USD de `PLAN_META`.
 *
 * Se valida el formato porque el valor acaba en
 * `new Intl.NumberFormat({ currency })`, y una moneda inválida lanza
 * `RangeError` en cada render de la página de facturación.
 */
export function mpCurrencyId(): string | null {
  const raw = process.env.MP_CURRENCY_ID?.trim().toUpperCase()
  return raw && /^[A-Z]{3}$/.test(raw) ? raw : null
}

/**
 * Monedas sin parte decimal. En ellas MP rechaza el importe con decimales: con
 * CLP, mandar `9990.00` devuelve 400 `property_value` ("does not match pattern")
 * en `total_amount` y en `items[0].unit_price`; hay que mandar `9990`.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF",
  "UGX", "UYI", "UYW", "VND", "VUV", "XAF", "XOF", "XPF",
])

/**
 * Importe del plan como lo espera la API de MP. Sale SIEMPRE de `MP_PRICE_*`
 * (nunca del cliente) y se formatea con los decimales que la moneda admite.
 */
export function mpAmountForPlan(plan: MpPlan): string | null {
  const envKey = plan === "PRO" ? "MP_PRICE_PRO" : "MP_PRICE_COLLECTOR"
  const raw = process.env[envKey]
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  const currency = mpCurrencyId()
  return currency && ZERO_DECIMAL_CURRENCIES.has(currency)
    ? String(Math.round(value))
    : value.toFixed(2)
}

/**
 * `external_reference` de la order. MP solo admite caracteres alfanuméricos con
 * `-` y `_` (un `:` lo rechaza), y es la única forma de volver del webhook a
 * nuestra fila. Formato: `gv_<userId>_<plan>`.
 */
export function mpExternalReference(userId: string, plan: MpPlan): string {
  return `gv_${userId}_${plan}`
}

const EXTERNAL_REFERENCE = /^gv_([A-Za-z0-9_-]{1,64})_(PRO|COLLECTOR)$/

/**
 * Referencia externa leída de una order de MP. Se valida contra la MISMA
 * allowlist que el resto de rutas (no un `parse` libre): lo que venga del
 * proveedor tiene que pasar por la misma puerta que lo que viene del cliente.
 */
export function parseMpExternalReference(
  reference: string | null | undefined,
): { userId: string; plan: MpPlan } | null {
  if (!reference) return null
  const match = EXTERNAL_REFERENCE.exec(reference)
  if (!match) return null
  return { userId: match[1], plan: match[2] as MpPlan }
}

/**
 * Id de order de MP. Solo se usa para decidir si un valor que viene del
 * proveedor (o de la URL de retorno) se puede pedir a la API: se valida el
 * formato antes de interpolarlo en el path, nunca se confía en él.
 */
const MP_ORDER_ID = /^ORD[A-Za-z0-9_-]{1,64}$/

export function isValidMpOrderId(id: string | null | undefined): boolean {
  return typeof id === "string" && MP_ORDER_ID.test(id)
}

/*
 * La `checkout_url` es el único destino al que mandamos al usuario con
 * `window.location.assign`, así que se valida antes de devolverla: tiene que ser
 * https y vivir en un dominio de Mercado Pago (`mercadopago.cl`, `mercadopago.com`,
 * `mercadopago.com.ar`...). Sin esto, un `checkout_url` raro se convertiría en
 * un redirect abierto desde nuestra propia página de facturación.
 */
const MP_CHECKOUT_HOST =
  /^(?:[a-z0-9-]+\.)*mercadopago\.(?:com(?:\.[a-z]{2})?|[a-z]{2,3})$/i

export function isValidMpCheckoutUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === "https:" && MP_CHECKOUT_HOST.test(parsed.hostname)
}

/**
 * Error de MP con un código estable para poder mapearlo a una respuesta útil sin
 * filtrar el mensaje del proveedor. El SDK lanza una jerarquía tipada
 * (`MPAuthenticationError`, `MPBadRequestError`, `MPValidationError`, ...), pero
 * solo nos interesa su `status`: el detalle va a consola.
 */
export class MpApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(`mercadopago:${code}:${status}`)
    this.name = "MpApiError"
    this.status = status
    this.code = code
  }
}

function toMpApiError(error: unknown): MpApiError {
  if (error instanceof MpApiError) return error
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? Number((error as { status: number }).status)
      : 0
  const raw =
    (error as { error?: unknown })?.error ?? (error as { message?: unknown })?.message
  const code = typeof raw === "string" && raw ? raw : "unknown"
  // El motivo real del rechazo (motivo del rechazo, ids de MP) solo a consola.
  console.error("mercadopago:", code, error)
  return new MpApiError(status, String(code).slice(0, 64))
}

// ---------------------------------------------------------------------------
// Checkout Pro (orders con redirección)
// ---------------------------------------------------------------------------

export type MpCheckoutOrderArgs = {
  plan: MpPlan
  userId: string
  amount: string
  /** Nombre del producto que ve el usuario en la página de MP. */
  title: string
  /** A dónde vuelve el usuario tras pagar (la misma para los tres desenlaces). */
  returnUrl: string
}

/**
 * Crea la order del Checkout Pro y devuelve la URL a la que hay que mandar al
 * usuario.
 *
 * `processing_mode: "manual"` es el único valor válido para Checkout Pro: la
 * procesa el hosted checkout de MP, no nuestro backend. Con `capture_mode:
 * "automatic"` el resultado está disponible en cuanto el pago se aprueba.
 *
 * `config.online` fija las return URLs y `auto_return: "all"` para que el
 * usuario vuelva SIEMPRE (aprobado, rechazado o pendiente) en vez de quedarse
 * atrapado en la página de MP. Las tres apuntan al mismo sitio a propósito: de
 * la URL solo se saca el mensaje, el estado real se repregunta a MP.
 *
 * No se manda `payer` a propósito: es opcional, el usuario escribe su email en
 * la página de MP, y en el sandbox de pruebas MP exige que ese email sea
 * `@testuser.com` (error `invalid_email_for_sandbox`), así que mandarle el
 * email real de un usuario de la app rompería el checkout de prueba.
 */
export async function createMpCheckoutOrder(
  args: MpCheckoutOrderArgs,
): Promise<{ orderId: string; checkoutUrl: string }> {
  const order = mpOrder()
  if (!order) throw new MpApiError(0, "not_configured")

  let created: MpOrder
  try {
    created = await order.create({
      body: {
        type: "online",
        processing_mode: "manual",
        capture_mode: "automatic",
        total_amount: args.amount,
        description: args.title,
        external_reference: mpExternalReference(args.userId, args.plan),
        items: [
          {
            title: args.title,
            unit_price: args.amount,
            quantity: 1,
          },
        ],
        config: {
          online: {
            success_url: args.returnUrl,
            failure_url: args.returnUrl,
            pending_url: args.returnUrl,
            auto_return: "all",
          },
        },
      },
      // El SDK manda su propia `X-Idempotency-Key` en toda escritura: la genera
      // una vez por llamada y la reutiliza en sus reintentos internos, que es
      // justo lo que evita que un reintento de red cree dos orders. No se fija a
      // mano porque no hay nada que deduplicar entre llamadas: reintentar el
      // checkout (doble clic, cambiar de medio de pago) debe poder abrir una
      // order nueva, igual que en Stripe. El plan no se activa nunca aquí.
    })
  } catch (error) {
    throw toMpApiError(error)
  }

  if (!created.id) throw new MpApiError(0, "missing_order_id")
  if (!isValidMpCheckoutUrl(created.checkout_url)) {
    // Sin `checkout_url` válido no hay a dónde mandar al usuario: se prefiere un
    // 502 a redirigir a una URL que no hemos podido verificar.
    console.error("mercadopago: checkout_url ausente o no permitido")
    throw new MpApiError(0, "missing_checkout_url")
  }
  return { orderId: created.id, checkoutUrl: created.checkout_url as string }
}

/**
 * Estado real de una order. Es la única fuente de verdad: ni la vuelta del
 * usuario ni el cuerpo de la notificación se creer sin pasar por aquí.
 */
export async function getMpOrder(id: string): Promise<MpOrder> {
  const order = mpOrder()
  if (!order) throw new MpApiError(0, "not_configured")
  try {
    return await order.get({ id })
  } catch (error) {
    throw toMpApiError(error)
  }
}

// ---------------------------------------------------------------------------
// Estado de pago de una order
// ---------------------------------------------------------------------------

/** Estados con los que MP da el pago por hecho. */
const PAID_STATUSES = new Set(["processed", "paid", "approved", "accredited"])

/** Estados que aun no son un pago (rechazos, cancelaciones, devoluciones). */
const DEAD_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "refunded",
  "charged_back",
])

function toNumber(value: string | undefined | null): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export type MpPaymentOutcome = "paid" | "pending" | "dead" | "unknown"

/**
 * Clasificación de una order para decidir qué hacer con la fila del usuario.
 *
 * "paid" exige las tres cosas: estado pagado, ningún pago muerto o en revisión,
 * y lo pagado cubriendo el total. Comprobar solo el importe daba acceso
 * prematuro con MP en `pending_review` (el dinero aún puede no ser del
 * vendedor), así que el importe es condición necesaria pero no suficiente.
 */
export function mpOrderOutcome(order: MpOrder): MpPaymentOutcome {
  const status = order.status?.toLowerCase() ?? ""

  for (const payment of order.transactions?.payments ?? []) {
    const paymentStatus = payment.status?.toLowerCase()
    if (paymentStatus && DEAD_STATUSES.has(paymentStatus)) return "dead"
    if (paymentStatus && !PAID_STATUSES.has(paymentStatus)) return "pending"
  }

  if (DEAD_STATUSES.has(status)) return "dead"
  if (!PAID_STATUSES.has(status)) return status ? "pending" : "unknown"

  const total = toNumber(order.total_amount)
  const paid = toNumber(order.total_paid_amount)
  if (total <= 0) return "unknown"
  return paid + 1e-9 >= total ? "paid" : "pending"
}

// ---------------------------------------------------------------------------
// Firmado de webhooks
// ---------------------------------------------------------------------------
/*
 * Headers: `x-signature=ts=<ts>,v1=<hex>` y `x-request-id`. Manifiesto firmado:
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". La comprobación la hace el
 * propio SDK (`WebhookSignatureValidator`), que recomputa el HMAC-SHA256 y
 * compara en tiempo constante.
 */
export function verifyMpSignature(
  request: Request,
  dataId: string,
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return false
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")
  if (!xSignature || !xRequestId || !dataId) return false

  /*
   * La documentación y sus ejemplos oficiales firman el `data.id` del query
   * param en MINÚSCULAS, pero MP lo envía tal cual lo escribió el recurso (los
   * ids de order van en mayúsculas). Se prueban las dos grafías: ambas están
   * firmadas con el mismo secreto, así que aceptar las dos no abre nada, y evita
   * que el webhook se quede mudo entero en producción por un detalle de caja.
   */
  let reason: string | null = null
  for (const candidate of [dataId.toLowerCase(), dataId]) {
    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId: candidate,
        secret,
        toleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
      })
      return true
    } catch (error) {
      if (!(error instanceof InvalidWebhookSignatureError)) throw error
      reason = error.reason
    }
  }

  // El motivo vive en el enum del SDK: es diagnóstico, nunca respuesta.
  console.error("mercadopago: firma de webhook rechazada:", reason)
  return false
}

/**
 * Por qué no se puede abrir un checkout de MP, o `null` si sí.
 *
 * Solo se comprueba la configuración del proveedor (token, moneda y precio del
 * plan). Ya no hay Card Form que montar ni pagador de prueba que elegir: el pago
 * ocurre en la página de MP, así que el único requisito real es que haya precios.
 */
export function mpCheckoutBlocker(): string | null {
  return isMpConfigured() ? null : "mp_not_configured"
}
