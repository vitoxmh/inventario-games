import type { Metadata } from "next"
import { prisma, Plan } from "@/lib/db"
import { DEFAULT_IMAGE_LIMITS } from "@/lib/plans"
import { AdminPlansClient } from "@/components/admin/admin-plans-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Planes",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminPlansPage() {
  const dict = await getDictionary()

  const rows = await prisma.planConfig.findMany({
    select: { plan: true, imageLimit: true },
  })
  const byPlan = new Map(rows.map((row) => [row.plan, row.imageLimit]))
  const planKeys = Object.keys(Plan) as Array<keyof typeof Plan>
  const configs = planKeys.map((plan) => ({
    plan,
    imageLimit: byPlan.get(plan) ?? DEFAULT_IMAGE_LIMITS[plan] ?? 1,
  }))

  return <AdminPlansClient initialConfigs={configs} dict={dict.admin} />
}