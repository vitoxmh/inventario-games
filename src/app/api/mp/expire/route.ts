import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  DEFAULT_PLAN_DURATION_DAYS,
  planDurationDaysOf,
} from "@/lib/plans"
import { isPaidPlanSlug, PAID_PLANS } from "@/lib/billing"

export const dynamic = "force-dynamic"

/*
 * Barrido diario de periodos vencidos de Mercado Pago.
 *
 * En este modelo MP NO agenda cobros y no se guarda tarjeta: cada pago da los
 * `durationDays` de su plan (lo edita el admin en /admin/plans) de acceso y el
 * siguiente ciclo vuelve a pasar por el checkout. Por eso no hay nada que
 * "renovar" aquí: lo que hay que hacer es cerrar el periodo de quien ya no lo ha
 * renovado, que es lo único que mantiene la promesa de "este plan da acceso
 * durante los días que dice su ficha".
 *
 * A quién degrada (y a quién NO):
 *  - Solo filas con `mpLastChargeAt` más antiguo que el periodo. El filtro `lt`
 *    excluye los `null` a propósito: un usuario de Stripe, o uno que nunca ha
 *    pagado con MP, tiene esa columna vacía y este endpoint no lo toca jamás.
 *  - Como la duración es POR PLAN, la consulta se hace con la más larga de las
 *    configuradas (un superconjunto de candidatos: así no se deja fuera a nadie)
 *    y hay un segundo corte en el bucle con el plazo del plan de cada fila. Con la
 *    misma instantánea de durations los dos cortes coinciden y el del bucle no
 *    llega a decidir nada: es una red de seguridad para el caso de que el admin
 *    edite `/admin/plans` entre la consulta y el update (subir la duración de un
 *    plan mientras corre el barrido), donde sí evita degradar antes de tiempo.
 *  - La lista de planes pagados se comprueba además en el bucle (allowlist), por
 *    si una fila quedara con `mpLastChargeAt` puesto y plan FREE.
 *  - Al degradar se limpia `mpLastChargeAt`, así que un FREE no vuelve a entrar
 *    nunca en la consulta.
 *
 * Autenticación: es un endpoint sin sesión (lo llama el cron, no un usuario).
 * Se exige `CRON_SECRET` contra la cabecera `Authorization: Bearer ...`, la
 * convención de Vercel Cron. Sin `CRON_SECRET` en el entorno el endpoint no
 * hace nada y responde 503: fail-closed, nunca "abierto porque no había nada
 * que proteger".
 *
 * GET y POST: Vercel Cron dispara una petición GET (documentación de Vercel), y
 * el POST se deja para dispararlo a mano o desde otro planificador. La regla de
 * "no mutar en GET" no aplica aquí: la autenticación es un secreto de servidor
 * en la cabecera, no una cookie de sesión, así que no hay superficie de CSRF, y
 * la acción está acotada por la ventana del periodo (es idempotente aunque se
 * ejecute mil veces).
 */

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization")
  if (!header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function POST(request: Request) {
  return runSweep(request)
}

export async function GET(request: Request) {
  return runSweep(request)
}

async function runSweep(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[mp:expire] CRON_SECRET no configurado")
    return NextResponse.json({ error: "not_configured" }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  /*
   * Un plazo por plan, no uno global: la duración la edita el admin y puede ser
   * distinta en cada plan. La consulta usa la MÁS larga (para no dejar fuera a
   * nadie) y el bucle vuelve a comprobar el plazo del plan de cada fila (para no
   * degradar a tiempo si la duración cambió entre medias).
   */
  const planDurations = new Map(
    (
      await prisma.plan.findMany({
        where: { slug: { in: [...PAID_PLANS] } },
        select: { slug: true, durationDays: true },
      })
    ).map((plan) => [plan.slug, planDurationDaysOf(plan.durationDays)]),
  )
  const longestPeriod = Math.max(
    DEFAULT_PLAN_DURATION_DAYS,
    ...planDurations.values(),
  )
  const expiredBefore = new Date(now - longestPeriod * 24 * 60 * 60 * 1000)

  const candidates = await prisma.user.findMany({
    where: {
      plan: { in: [...PAID_PLANS] },
      mpLastChargeAt: { lt: expiredBefore },
    },
    select: { id: true, plan: true, mpLastChargeAt: true },
    take: 500,
  })

  const summary = { expired: 0, skipped: 0 }

  for (const user of candidates) {
    // Allowlist de planes: el filtro de la consulta ya lo acota, pero lo que
    // decide degradar a FREE es esta comprobación, no una suposición.
    if (!isPaidPlanSlug(user.plan)) {
      summary.skipped += 1
      continue
    }
    // El plazo que manda es el del plan de ESTA fila. Un plan que ya no está en
    // la tabla (o con una duración corrupta) cae al valor por defecto en vez de
    // dejar al usuario con acceso indefinido.
    const days = planDurations.get(user.plan) ?? DEFAULT_PLAN_DURATION_DAYS
    const chargedAt = user.mpLastChargeAt?.getTime() ?? 0
    if (chargedAt + days * 24 * 60 * 60 * 1000 > now) {
      // Periodo todavía vigente: entró en la consulta por el plazo del plan más
      // largo, pero el suyo no ha vencido.
      summary.skipped += 1
      continue
    }
    try {
      // El `id` sale de la consulta filtrada por `mpLastChargeAt`, no del
      // cliente: el endpoint no recibe body. Aun así el update va con el `id` de
      // la fila leída, nunca con uno recibido por parámetro.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: "FREE",
          subscriptionStatus: "INACTIVE",
          mpLastChargeAt: null,
        },
      })
      console.error(
        `[mp:expire] ${user.id} vuelve a FREE (ultimo cobro ${user.mpLastChargeAt?.toISOString()})`,
      )
      summary.expired += 1
    } catch (error) {
      // Un fallo de BD no debe tumbar el lote entero: se cuenta y se sigue. El
      // detalle va a consola, nunca al cliente.
      console.error(`[mp:expire] fallo al degradar a ${user.id}:`, error)
      summary.skipped += 1
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
