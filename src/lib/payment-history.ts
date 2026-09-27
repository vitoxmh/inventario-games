import "server-only"

import { prisma } from "@/lib/db"
import { isPaidPlanSlug, type PaidPlan } from "@/lib/billing"
import { planDurationDaysOf } from "@/lib/plans"

/*
 * Historial de pagos: la escritura (idempotente) y la lectura de la tabla
 * `Payment`. Es el ÚNICO módulo que toca esa tabla, para que las dos mitades no
 * se separen: lo que se escribe aquí es exactamente lo que la facturación pinta.
 *
 * Quién escribe, y por qué solo ahí:
 *  - MP: `settleMpCheckout`, cuando la order está pagada. Esa función ya es el
 *    punto único de la verdad para MP (la llaman el webhook y la liquidación de
 *    la página), así que el pago queda registrado se llegue por donde se llegue.
 *  - Stripe: el evento `invoice.paid` del webhook, que es el evento del dinero
 *    (el `checkout.session.completed` solo dice que se abrió la sesión).
 *
 * Lo que NO escribe aquí: la vuelta del usuario desde la return URL con
 * `?checkout=success`, ni el cron de vencimientos, ni un GET. Ninguno ha visto
 * el dinero.
 */

/** Desenlaces admitidos. Hoy solo se registran cobros: ver el modelo `Payment`. */
const PAYMENT_STATUSES = ["paid"] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Tope defensivo: ningún proveedor cobra una cantidad así. */
const MAX_AMOUNT_MINOR = 100_000_000
/** Un código ISO 4217 son 3 letras; `Intl` lanza RangeException con cualquier otra cosa. */
const CURRENCY = /^[A-Z]{3}$/
const MAX_EXTERNAL_ID_LENGTH = 255

export type RecordPaymentArgs = {
  userId: string
  provider: "stripe" | "mp"
  /** Id del recurso en el proveedor: `in_…` de la factura (Stripe) u `ORD…` (MP). */
  externalId: string
  plan: string
  /** Importe en unidades MENORES de la moneda del proveedor. */
  amountMinor: number
  currency: string
  /** Días que compró el pago: la duración del plan en el momento de cobrar. */
  durationDays: number
  status?: PaymentStatus
  paidAt: Date
}

/**
 * Registra un pago. Idempotente por `(provider, externalId)`: si la fila ya
 * existe la ACTUALIZA en vez de crear otra, porque los dos proveedores reenvían
 * notificaciones y la misma order de MP se liquida otra vez cada vez que el
 * usuario abre la facturación. Volver a cobrar no es un pago nuevo.
 *
 * Valida antes de escribir (todo lo que viene de la API de un proveedor o de una
 * fila tocada a mano es input hostil): si algo no cuadra devuelve `null` y lo
 * dice por consola, sin lanzar. Perder una fila del historial es malo; reventar
 * el webhook de un pago ya cobrado también, y el grant no depende de esta fila.
 */
export async function recordPayment(args: RecordPaymentArgs): Promise<boolean> {
  const externalId = String(args.externalId ?? "").trim()
  const currency = String(args.currency ?? "").trim().toUpperCase()
  const status = args.status ?? "paid"
  const plan = String(args.plan ?? "").trim().toUpperCase()
  const amountMinor = Number(args.amountMinor)
  const paidAt = args.paidAt

  if (!args.userId) return rejected("pago sin userId", externalId)
  if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) {
    return rejected("externalId inválido", externalId)
  }
  if (args.provider !== "stripe" && args.provider !== "mp") {
    return rejected(`proveedor desconocido: ${String(args.provider)}`, externalId)
  }
  if (!CURRENCY.test(currency)) {
    return rejected(`moneda inválida: ${currency}`, externalId)
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) {
    return rejected(`importe inválido: ${String(args.amountMinor)}`, externalId)
  }
  if (!isPaidPlanSlug(plan)) {
    return rejected(`plan fuera de la allowlist: ${plan}`, externalId)
  }
  if (!(PAYMENT_STATUSES as readonly string[]).includes(status)) {
    return rejected(`estado inválido: ${status}`, externalId)
  }
  if (
    !(paidAt instanceof Date) ||
    Number.isNaN(paidAt.getTime())
  ) {
    return rejected("paidAt inválido", externalId)
  }

  const durationDays = planDurationDaysOf(args.durationDays)

  try {
    await prisma.payment.upsert({
      where: { provider_externalId: { provider: args.provider, externalId } },
      create: {
        userId: args.userId,
        provider: args.provider,
        externalId,
        plan,
        amountMinor,
        currency,
        durationDays,
        status,
        paidAt,
      },
      // Una reentrega no reescribe el importe ni la fecha: si el primer aviso
      // trajo algo a medias y el segundo lo trae completo, el segundo gana, pero
      // la fila nunca se duplica ni cambia de propietario.
      update: {
        amountMinor,
        currency,
        plan,
        durationDays,
        status,
        paidAt,
      },
    })
    return true
  } catch (error) {
    console.error(
      `[payments] no se pudo registrar el pago ${args.provider}/${externalId}:`,
      error,
    )
    return false
  }
}

function rejected(why: string, externalId: string): false {
  console.error(`[payments] pago descartado (${why}): ${externalId || "(sin id)"}`)
  return false
}

/** Un pago tal como lo pinta la página de facturación. */
export type PaymentRow = {
  id: string
  provider: "stripe" | "mp"
  /** Referencia del cobro en el proveedor: el `in_…`/`ORD…` que se muestra. */
  externalId: string
  plan: PaidPlan | string
  amountMinor: number
  currency: string
  durationDays: number
  status: string
  paidAt: Date
}

/** Cuántos pagos tiene en total, para poder decir "se muestran los últimos N". */
export async function countUserPayments(userId: string): Promise<number> {
  if (!userId) return 0
  return prisma.payment.count({ where: { userId } })
}

/**
 * Historial del usuario, del pago más reciente al más antiguo.
 *
 * `userId` lo pone siempre el llamante desde la SESIÓN: la consulta filtra por
 * propietario, así que un id ajeno no devuelve ni una fila. El tope evita que
 * un historial infinito se coma el HTML de la página.
 */
export async function listUserPayments(
  userId: string,
  limit = 20,
): Promise<PaymentRow[]> {
  if (!userId) return []
  const take = Math.min(100, Math.max(1, Math.trunc(limit) || 20))
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { paidAt: "desc" },
    take,
    select: {
      id: true,
      provider: true,
      externalId: true,
      plan: true,
      amountMinor: true,
      currency: true,
      durationDays: true,
      status: true,
      paidAt: true,
    },
  })
}
