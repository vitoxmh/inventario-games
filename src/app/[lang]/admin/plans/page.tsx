import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { AdminPlansClient } from "@/components/admin/admin-plans-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Planes",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminPlansPage() {
  const dict = await getDictionary()

  const [plans, counts] = await Promise.all([
    prisma.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      select: {
        slug: true,
        nameEs: true,
        nameEn: true,
        gameLimit: true,
        imageLimit: true,
        paid: true,
        active: true,
        sortOrder: true,
      },
    }),
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
  ])
  const usersByPlan = new Map(counts.map((row) => [row.plan, row._count._all]))

  return (
    <AdminPlansClient
      initialPlans={plans.map((plan) => ({
        ...plan,
        gameLimit: plan.gameLimit,
        userCount: usersByPlan.get(plan.slug) ?? 0,
      }))}
      dict={dict.admin}
    />
  )
}