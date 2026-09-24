import "server-only"
import { prisma } from "@/lib/db"

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