import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { AdminPlansClient } from "@/components/admin/admin-plans-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { mpCurrencyId } from "@/lib/mp"
import {
  MAX_PLAN_DURATION_DAYS,
  MIN_PLAN_DURATION_DAYS,
} from "@/lib/plans"

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
        priceCents: true,
        mpPriceMinor: true,
        stripeProductId: true,
        durationDays: true,
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
      // El cliente es un componente de cliente y no puede leer el entorno: la
      // moneda de MP se resuelve aquí y se le pasa ya normalizada. El rango
      // válido de la duración viene del mismo módulo que valida la API, para que
      // el `min`/`max` del input no sea una copia que se pueda quedar vieja.
      mpCurrency={mpCurrencyId()}
      durationRange={{
        min: MIN_PLAN_DURATION_DAYS,
        max: MAX_PLAN_DURATION_DAYS,
      }}
    />
  )
}
