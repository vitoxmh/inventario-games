import "server-only"
import { prisma } from "@/lib/db"
import {
  getMpOrder,
  isValidMpOrderId,
  mpAccountCurrency,
  mpAmountMinorOf,
  mpCurrencyOf,
  mpOrderOutcome,
  parseMpExternalReference,
  type MpPaymentOutcome,
} from "@/lib/mp"
import { isPaidPlanSlug, TIER_RANK, type PaidPlan } from "@/lib/billing"
import { recordPayment } from "@/lib/payment-history"
import { getPlanDurationDays } from "@/lib/plans"

/*
 * Liquidación de las orders de Mercado Pago: el ÚNICO sitio donde se decide si un
 * pago concede plan, renueva su periodo o degrada la suscripción.
 *
 * El webhook (`order`) y la página de facturación son dos entradas distintas al
 * MISMO camino, y por eso la lógica vive aquí y no en ninguno de los dos. Con la
 * lógica en el webhook, liquidar un pago que la notificación no alcanzó a tocar
 * obligaría a duplicar las reglas en un segundo sitio, y dos copias de "qué
 * concede un pago" divergen solas.
 *
 * Qué se resuelve y con qué evidencia:
 *  - La notificación NO es la fuente de verdad, y tampoco esta función: se
 *    repregunta a la API de MP (`GET /v1/orders/{id}`) y es esa respuesta la que
 *    manda. `mpOrderOutcome` es quien clasifica (ver `src/lib/mp.ts`).
 *  - La identidad sale del `external_reference` de la order, que generamos
 *    nosotros al crearla y que se revalida contra la allowlist de planes. Nunca
 *    de un parámetro de la petición ni del cuerpo de la notificación.
 *  - `orderId` se valida por formato ANTES de meterse en el path de la API.
 *
 * Idempotente: liquidar dos veces la misma order converge al mismo estado, que es
 * lo que permite que MP reenvíe notificaciones y que la página lo intente en
 * cada visita.
 */

/** Cuántas orders sin resolver se repreguntan de una vez al abrir la facturación. */
const PENDING_BATCH = 5

/** Desenlace de la liquidación, para logs y para que la página decida qué pintar. */
export type MpSettlement =
  /** Pago confirmado: el plan queda concedido y el periodo arranca ahora. */
  | { outcome: "granted"; plan: PaidPlan }
  /** Pago de un plan igual o inferior al que ya tenía: solo se renueva el periodo. */
  | { outcome: "renewed"; plan: PaidPlan }
  /** Order muerta (rechazada, cancelada, reembolsada): PAST_DUE conservando el plan. */
  | { outcome: "past_due" }
  /** MP todavía no da el pago por hecho: no se toca nada y se vuelve a intentar. */
  | { outcome: "not_paid"; reason: MpPaymentOutcome }
  /** No es una order nuestra, o ya no queda nadie a quien concederle. */
  | { outcome: "not_ours" }
  /** No se pudo leer la order en la API de MP. */
  | { outcome: "lookup_failed" }

/**
 * Liquida una order de MP y replica su estado REAL en la fila del usuario.
 *
 * `expectedUserId`, cuando viene, es la atadura de propiedad: la row de
 * `MpCheckout` se busca por `orderId` **y** por ese usuario, y si la referencia
 * de la order apunta a otro se descarta sin tocar nada. Es lo que permite llamar
 * a esta función desde una página de usuario sin abrir un IDOR. El webhook
 * (fuera de toda sesión) no lo pasa: ahí la identidad sale de la propia
 * referencia firmada por MP.
 */
export async function settleMpCheckout(
  orderId: string,
  expectedUserId?: string,
): Promise<MpSettlement> {
  if (!isValidMpOrderId(orderId)) {
    console.error("[mp:settle] order id con formato inesperado:", orderId)
    return { outcome: "not_ours" }
  }

  // La row es opcional a propósito: se crea en la ruta de checkout, así que una
  // order pagada antes de que existiera esta tabla igual debe poder liquidarse por
  // webhook. Cuando sí está, su usuario tiene que coincidir con el de la
  // referencia: es una comprobación de integridad, no la fuente de identidad.
  const row = await prisma.mpCheckout.findUnique({
    where: { orderId },
    select: { userId: true },
  })
  if (expectedUserId && row && row.userId !== expectedUserId) {
    console.error(`[mp:settle] order ${orderId} no pertenece al usuario esperado`)
    return { outcome: "not_ours" }
  }

  let order
  try {
    order = await getMpOrder(orderId)
  } catch (error) {
    console.error(`[mp:settle] no se pudo leer la order ${orderId}:`, error)
    return { outcome: "lookup_failed" }
  }

  const reference = parseMpExternalReference(order.external_reference)
  if (!reference || !isPaidPlanSlug(reference.plan)) {
    // Silencioso para quien llama, pero no mudo: si la referencia no vuelve
    // intacta el plan no se concede nunca, y sin esta línea es indistinguible de
    // "el webhook no llegó".
    console.error(
      `[mp:settle] order ${orderId} con external_reference inesperado:`,
      order.external_reference,
    )
    return { outcome: "not_ours" }
  }

  const plan = reference.plan
  const user = await prisma.user.findUnique({
    where: { id: reference.userId },
    select: { id: true, plan: true },
  })
  if (!user) return { outcome: "not_ours" }

  const outcome = mpOrderOutcome(order)

  if (outcome === "paid") {
    // Un pago de un plan INFERIOR al que ya tiene (una orden vieja que llegó
    // tarde) no degrada: solo se renueva su periodo.
    const renewed = TIER_RANK[plan] < TIER_RANK[user.plan]
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(renewed ? {} : { plan, subscriptionStatus: "ACTIVE" }),
        mpLastChargeAt: new Date(),
      },
    })
    await markResolved(orderId, "paid")
    /*
     * Historical de pagos, desde aquí y no desde el webhook: esta es la única
     * función por la que pasa un pago de MP realmente cobrado, y la llaman las dos
     * entradas (notificación y página). Se registra después de conceder el plan
     * para que un fallo al escribir la fila no deje al usuario sin lo que pagó:
     * `recordPayment` se traga sus errores y, como el `upsert` es idempotente por
     * order, el siguiente intento (o la próxima visita a la facturación) la deja
     * bien sin duplicarla.
     */
    const durationDays = await getPlanDurationDays(plan)
    await recordPayment({
      userId: user.id,
      provider: "mp",
      externalId: orderId,
      plan,
      amountMinor: mpAmountMinorOf(order),
      currency: mpCurrencyOf(order),
      durationDays,
      paidAt: new Date(),
    })
    return { outcome: renewed ? "renewed" : "granted", plan }
  }

  if (outcome === "dead") {
    // El periodo en curso ya se pagó y sigue hasta su fecha, así que
    // `mpLastChargeAt` NO se toca: de eso se encarga el barrido diario.
    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: "PAST_DUE" },
    })
    await markResolved(orderId, "dead")
    return { outcome: "past_due" }
  }

  // `pending` o `unknown`: no se toca nada. Un pago en revisión puede acabar
  // acreditándose, y degradar aquí dejaría al usuario sin lo que pagó. La row
  // queda `pending` a propósito, para que la próxima visita la reintente.
  console.error(
    `[mp:settle] order ${orderId} sin conceder plan: estado "${outcome}"`,
  )
  return { outcome: "not_paid", reason: outcome }
}

/**
 * Liquida las orders de un usuario que siguen sin resolver. Es el camino de la
 * página de facturación: el plan se muestra ya liquidado en el mismo render, sin
 * depender de que la notificación del webhook llegara alguna vez.
 *
 * Va en paralelo y con un tope (`PENDING_BATCH`): liquidar es una llamada a la
 * API de MP por order, y una de esas llamadas lenta no puede retrasar la página.
 * Un fallo puntual se cuenta y se sigue con las demás, y la row queda `pending`
 * para el siguiente intento.
 */
export async function settlePendingMpCheckoutsForUser(
  userId: string,
): Promise<MpSettlement[]> {
  // `userId` sale de la sesión en el llamante, nunca de un parámetro: la consulta
  // filtra por propietario, así que un id ajeno no trae ni una fila.
  //
  // La consulta va dentro del try a propósito: liquidar es una mejora de la
  // página, no su condición para existir. Si la tabla todavía no existe (la
  // migración va por detrás del deploy) o la BD no responde, la pantalla de
  // facturación tiene que seguir funcionando igual y el plan se concede por
  // webhook, que no pasa por aquí.
  let pending: { orderId: string }[]
  try {
    pending = await prisma.mpCheckout.findMany({
      where: { userId, status: "pending" },
      select: { orderId: true },
      orderBy: { createdAt: "asc" },
      take: PENDING_BATCH,
    })
  } catch (error) {
    console.error("[mp:settle] no se pudieron leer las orders pendientes:", error)
    return []
  }
  if (pending.length === 0) return []

  const results = await Promise.all(
    pending.map(async ({ orderId }) => {
      try {
        return await settleMpCheckout(orderId, userId)
      } catch (error) {
        // Un fallo de BD o de red no debe tumbar la página de facturación.
        console.error(`[mp:settle] fallo al liquidar ${orderId}:`, error)
        return { outcome: "lookup_failed" } as const
      }
    }),
  )
  return results
}

/**
 * Registra en el historial los pagos de MP que ya estaban liquidados y aún no
 * tienen fila: los que se pagaron antes de que existiera la tabla `Payment`.
 *
 * Es una reparación, no un camino normal. Se apoya en que `status: "paid"` en
 * `MpCheckout` no lo pone esta app sino `settleMpCheckout`, y solo después de
 * que la API de MP confirmara el cobro; el importe es el mismo que se guardó al
 * crear la order. No llama a MP (para eso está el sweep de pendientes) ni cambia
 * el plan del usuario: solo escribe filas que ya son un hecho.
 *
 * Sin esto, un pago real se perdería del historial para siempre: el sweep solo
 * mira orders `pending`, así que una order ya resuelta nunca vuelve a pasar por
 * `settleMpCheckout`. Va por el mismo `recordPayment` (y por tanto el mismo
 * `upsert` idempotente) que el camino normal, con lo que llamarlo dos veces no
 * duplica nada.
 *
 * Los pagos de Stripe anteriores a la tabla no se reparan: aquí no queda copia de
 * las facturas, y pedirle a Stripe las facturas de un año cada vez que se abre la
 * facturación no es una reparación sino una factura por visita.
 */
export async function backfillMissingPaymentsForUser(
  userId: string,
): Promise<number> {
  if (!userId) return 0
  // No hay relación entre `MpCheckout` y `Payment` (el pago se identifica por
  // proveedor + id de order, que es única en los dos sitios pero no es la clave de
  // ninguna), así que el cruce se hace en memoria: las dos consultas van
  // filtradas por el usuario de la sesión y son cortas.
  let paid: { orderId: string; plan: string; amount: string; resolvedAt: Date | null }[]
  let registered: { externalId: string }[]
  try {
    ;[paid, registered] = await Promise.all([
      prisma.mpCheckout.findMany({
        where: { userId, status: "paid" },
        select: { orderId: true, plan: true, amount: true, resolvedAt: true },
        orderBy: { createdAt: "desc" },
        take: PENDING_BATCH,
      }),
      prisma.payment.findMany({
        where: { userId, provider: "mp" },
        select: { externalId: true },
      }),
    ])
  } catch (error) {
    console.error("[mp:settle] no se pudieron leer los pagos a reparar:", error)
    return 0
  }

  const alreadyRecorded = new Set(registered.map((row) => row.externalId))
  const currency = mpAccountCurrency()
  let recorded = 0
  for (const row of paid) {
    if (alreadyRecorded.has(row.orderId)) continue
    // El mismo criterio que `mpAmountMinorOf`: unidades MENORES enteras, y si el
    // dato no encaja en el modelo se descarta en vez de redondear.
    const amountMinor = Number(row.amount)
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) continue
    const durationDays = await getPlanDurationDays(row.plan)
    const ok = await recordPayment({
      userId,
      provider: "mp",
      externalId: row.orderId,
      plan: row.plan,
      amountMinor,
      currency,
      durationDays,
      paidAt: row.resolvedAt ?? new Date(),
    })
    if (ok) recorded += 1
  }
  return recorded
}

/**
 * Guarda la order recién creada en el checkout. Lo escribe la ruta (que ya tiene
 * sesión) y no `payments.ts`, para que el módulo de dominio no dependa de
 * "quién" la llamó.
 *
 * `upsert` y no `create`: si el usuario reintenta y MP devolviera un id ya
 * conocido, se actualiza la fila en vez de duplicar el pago en el registro.
 *
 * Un fallo aquí NO se propaga a la ruta. Perder el registro de la order solo
 * cuesta la reconciliación posterior (que es una mejora), mientras que fallar el
 * checkout le quitaría al usuario la URL de pago. El grant del webhook no
 * depende de esta fila, así que el pago sigue siendo concedible sin ella.
 */
export async function recordMpCheckout(args: {
  orderId: string
  userId: string
  plan: PaidPlan
  amount: string
}): Promise<void> {
  try {
    await prisma.mpCheckout.upsert({
      where: { orderId: args.orderId },
      create: {
        orderId: args.orderId,
        userId: args.userId,
        plan: args.plan,
        amount: args.amount,
      },
      // Un reintento del checkout reabre la order: si estaba resuelta vuelve a
      // `pending` para que la vuelta del usuario la pueda liquidar.
      update: { status: "pending", resolvedAt: null },
    })
  } catch (error) {
    console.error(
      `[mp:settle] no se pudo registrar la order ${args.orderId}:`,
      error,
    )
  }
}

/** Cierra la row de una order con su desenlace y el momento en que se supo. */
async function markResolved(
  orderId: string,
  status: "paid" | "dead",
): Promise<void> {
  await prisma.mpCheckout.updateMany({
    where: { orderId },
    data: { status, resolvedAt: new Date() },
  })
}
