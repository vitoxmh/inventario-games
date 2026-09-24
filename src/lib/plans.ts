import { prisma, type Plan } from "@/lib/db"

export const PLAN_LIMITS: Record<Plan, number | null> = {
  FREE: 25,
  PRO: 500,
  COLLECTOR: null,
}

// Límites por defecto de fotos por juego; el admin puede sobreescribirlos
// en /admin/plans (tabla "PlanConfig").
export const DEFAULT_IMAGE_LIMITS: Record<Plan, number> = {
  FREE: 1,
  PRO: 3,
  COLLECTOR: 5,
}

export async function getImageLimit(plan: Plan): Promise<number> {
  const config = await prisma.planConfig.findUnique({
    where: { plan },
    select: { imageLimit: true },
  })
  return config?.imageLimit ?? DEFAULT_IMAGE_LIMITS[plan] ?? 1
}

export function getPlanLimit(plan: Plan): number | null {
  return PLAN_LIMITS[plan]
}

export function isPaidPlan(plan: Plan): boolean {
  return plan === "PRO" || plan === "COLLECTOR"
}