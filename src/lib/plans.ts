import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import type { Dictionary } from "@/messages/es"

export type PlanRow = {
  slug: string
  nameEs: string
  nameEn: string
  gameLimit: number | null
  imageLimit: number
  paid: boolean
  active: boolean
  sortOrder: number
  /**
   * Precio de Stripe en céntimos de USD (`999` = $9.99), o `null` si el plan no
   * se vende por Stripe. Vive en la fila y lo edita el admin, no el entorno.
   */
  priceCents: number | null
  /**
   * Precio de Mercado Pago en unidades menores de la moneda de la cuenta MP
   * (`9990` = $9.990 en CLP, que no tiene parte decimal), o `null` si el plan no
   * se vende por MP.
   */
  mpPriceMinor: number | null
  /** Product de Stripe donde se cuelga el `price_data`; `null` = generado al vuelo. */
  stripeProductId: string | null
  /**
   * Días de acceso que compra un pago del plan (`30` = mensual). Lo edita el
   * admin en /admin/plans y es el mismo dato para los dos proveedores: el
   * periodo pagado en MP y el periodo de la suscripción en Stripe.
   */
  durationDays: number
}

export type Locale = "es" | "en"

const planSelect = {
  slug: true,
  nameEs: true,
  nameEn: true,
  gameLimit: true,
  imageLimit: true,
  paid: true,
  active: true,
  sortOrder: true,
  priceCents: true,
  mpPriceMinor: true,
  stripeProductId: true,
  durationDays: true,
} as const

/*
 * Duración de un plan: la MISMA regla en los tres sitios donde importa (el alta y
 * el PATCH del admin, el checkout de Stripe y el barrido de MP), para que no sea
 * posible que uno acepte un valor que otro luego rechace o ignore.
 *
 * El mínimo es 1 día porque un plan de pago con la duración a 0 no significaría
 * nada (nadie cobra un periodo vacío, y en Stripe un `interval_count` de 0 se
 * rechaza), y el máximo es el tope de Stripe: la API no admite un periodo de más
 * de tres años (3 años, 36 meses o 156 semanas). Un plan más largo que eso sería
 * vendible en MP pero rechazable en Stripe, así que ni se deja configurar.
 */
export const MIN_PLAN_DURATION_DAYS = 1
export const MAX_PLAN_DURATION_DAYS = 1095

/**
 * Duración con la que se han vendido siempre los planes. Es el valor de
 * respaldo cuando la fila no existe o trae un `durationDays` que no pasa la
 * validación (una fila tocada a mano por SQL): fallar de forma ruidosa aquí
 * dejaría a un cliente de pago sin periodo, y un periodo de 30 días es
 * exactamente lo que se le vendió.
 */
export const DEFAULT_PLAN_DURATION_DAYS = 30

/** ¿Es `value` una duración de plan válida? */
export function isValidDurationDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PLAN_DURATION_DAYS &&
    value <= MAX_PLAN_DURATION_DAYS
  )
}

/**
 * Duración efectiva de un valor que puede venir de la BD o del cuerpo de una
 * petición: la válida si lo es, y la de por defecto si no. Nunca lanza ni
 * devuelve un número que un proveedor vaya a rechazar.
 */
export function planDurationDaysOf(value: unknown): number {
  return isValidDurationDays(value) ? value : DEFAULT_PLAN_DURATION_DAYS
}

export function planName(plan: PlanRow, locale: Locale): string {
  const name = locale === "en" ? plan.nameEn : plan.nameEs
  return name || plan.slug
}

/*
 * Bullets de un plan derivados de sus límites en BD (no de textos sueltos por
 * plan), para que la página de precios y la de facturación no puedan
 * contradecirse cuando el admin cambie un límite desde /admin/plans.
 */
export function planFeatures(
  plan: PlanRow,
  pricing: Dictionary["pricing"],
): string[] {
  return [
    plan.gameLimit === null
      ? pricing.gamesUnlimited
      : `${plan.gameLimit} ${pricing.games}`,
    `${plan.imageLimit} ${pricing.photosPerGame}`,
    ...(plan.paid ? [pricing.prioritySupport] : []),
  ]
}

export async function getPlan(slug: string): Promise<PlanRow | null> {
  return prisma.plan.findUnique({ where: { slug }, select: planSelect })
}

export async function listPlans(opts?: {
  activeOnly?: boolean
}): Promise<PlanRow[]> {
  return prisma.plan.findMany({
    ...(opts?.activeOnly ? { where: { active: true } } : {}),
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    select: planSelect,
  })
}

export async function getPlanLimit(slug: string): Promise<number | null> {
  const plan = await prisma.plan.findUnique({
    where: { slug },
    select: { gameLimit: true },
  })
  return plan?.gameLimit ?? null
}

export async function getImageLimit(slug: string): Promise<number> {
  const plan = await prisma.plan.findUnique({
    where: { slug },
    select: { imageLimit: true },
  })
  return plan?.imageLimit ?? 1
}

export async function isPaidPlan(slug: string): Promise<boolean> {
  const plan = await prisma.plan.findUnique({
    where: { slug },
    select: { paid: true },
  })
  return plan?.paid ?? false
}

/**
 * Días de acceso que compra un pago de este plan, o el valor por defecto si la
 * fila no existe. La duración nunca se recibe del cliente ni del entorno: sale
 * de la tabla, que es donde la edita el admin.
 */
export async function getPlanDurationDays(slug: string): Promise<number> {
  const plan = await prisma.plan.findUnique({
    where: { slug },
    select: { durationDays: true },
  })
  return planDurationDaysOf(plan?.durationDays)
}

/**
 * Sufijo del precio ("/mes", "/3 meses"): el periodo REAL del plan, el mismo
 * número que el admin edita en /admin/plans y el que se cobra de verdad.
 *
 * Los 30 días —el caso por defecto y el único que había— se siguen pintando
 * como "/mes", y cualquier otra duración se formatea con `Intl` en la unidad que
 * le toca (días, semanas, meses, años). La alternativa sería dejar "/mes"
 * hardcodeado, que pasa a ser mentira en cuanto alguien configura un plan
 * trimestral o anual.
 *
 * El plural sale de `Intl` (que sabe decir "3 meses" en cada idioma sin escribirlo
 * en dos archivos) y el singular sin número sale de las tres palabras del
 * diccionario, porque "1 mes" y "1 año" suenan a dato, no a precio. El mes no
 * necesita palabra propia: 30 días cae siempre en `pricing.monthly`.
 */
export function planPeriodLabel(
  plan: PlanRow,
  pricing: Dictionary["pricing"],
  locale: Locale,
): string {
  return durationPeriodLabel(plan.durationDays, pricing, locale)
}

/**
 * La misma etiqueta pero desde un número de días suelto, para lo que no tiene una
 * fila de `Plan` delante: el historial de pagos, donde cada pago guarda la
 * duración que compró en el momento de pagarse (una foto, no una referencia al
 * plan de hoy). Que las dos rutas no puedan divergir es justo el motivo de
 * separar el cálculo: `/3 meses` en un pago y `/mes` en el mismo plan del mismo
 * día sería un bug de contenido.
 */
export function durationPeriodLabel(
  days: number,
  pricing: Dictionary["pricing"],
  locale: Locale,
): string {
  const safeDays = planDurationDaysOf(days)
  const unit: keyof typeof UNIT_DAYS =
    safeDays % 365 === 0
      ? "year"
      : safeDays % 30 === 0
        ? "month"
        : safeDays % 7 === 0
          ? "week"
          : "day"
  const count = Math.max(1, Math.floor(safeDays / UNIT_DAYS[unit]))
  if (count === 1) {
    return unit === "day"
      ? pricing.periodDay
      : unit === "week"
        ? pricing.periodWeek
        : unit === "month"
          ? pricing.monthly
          : pricing.periodYear
  }
  return `/${new Intl.NumberFormat(locale === "en" ? "en-US" : "es-ES", {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(count)}`
}

/** Días que tiene cada unidad, para no repetir la división en el formateo. */
const UNIT_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const

/**
 * Precio de un plan para un proveedor, o `null` si ese proveedor no lo vende.
 *
 * Es la FUNCIÓN que decide el importe que se cobra, y por eso exige las tres
 * cosas a la vez: que el plan exista, que siga `active` y `paid` (desactivar un
 * plan en el admin tiene que cortar la venta, no solo esconderlo), y que tenga
 * importe para ese proveedor. Si algo de eso falla se devuelve `null` y quien
 * llama responde 503: inventarse un importe o vender un plan desactivado es
 * justo el peor resultado posible en dinero.
 *
 * El importe sale SIEMPRE de la fila, nunca del cuerpo de la petición: el slug
 * llega del cliente pero validado contra la allowlist de `PAID_PLANS`.
 */
export async function getPlanPrice(
  slug: string,
  provider: "stripe" | "mp",
): Promise<number | null> {
  const plan = await getPlan(slug)
  if (!plan || !plan.active || !plan.paid) return null
  const price = provider === "stripe" ? plan.priceCents : plan.mpPriceMinor
  if (price === null || !Number.isInteger(price) || price <= 0) return null
  return price
}

/**
 * Datos de Stripe que necesita el checkout y que no son el importe: el Product
 * donde colgar el `price_data`. `null` significa que se genere uno efímero con el
 * nombre del plan.
 */
export async function getPlanStripeProduct(
  slug: string,
): Promise<{ productId: string | null; name: string } | null> {
  const plan = await getPlan(slug)
  if (!plan || !plan.active || !plan.paid) return null
  return { productId: plan.stripeProductId, name: plan.nameEn || plan.slug }
}

/**
 * Plan de quien está viendo la página, o `null` si no hay sesión.
 *
 * Se relee de la fila y no del claim `session.user.plan`: el token es una caché
 * (lo refresca el callback `jwt`) y lo que pintamos es "qué plan tienes". Sin
 * sesión no se toca la BD, así que una visita anónima a una página pública no
 * paga la consulta.
 *
 * Lo usan las páginas que comparten tarjetas de plan con un destino distinto
 * según haya o no cuenta (ahora la de precios): sin esto, un suscriptor ve
 * "Elegir plan" sobre el plan que ya está pagando.
 */
export async function getViewerPlan(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  })
  return user?.plan ?? null
}