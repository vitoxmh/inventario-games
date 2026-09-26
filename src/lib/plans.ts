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
} as const

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