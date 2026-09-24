import type { Metadata } from "next"
import { CreditCard } from "lucide-react"
import { prisma, Plan, SubscriptionStatus } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Suscripciones",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

function formatDate(value: Date | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(value)
}

export default async function AdminSubscriptionsPage() {
  const dict = await getDictionary()
  const adminDict = dict.admin

  const [totalUsers, planCounts, subCounts, recent] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.user.groupBy({
      by: ["subscriptionStatus"],
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { OR: [{ subscriptionStatus: { not: null } }, { plan: { not: "FREE" } }] },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        mpPreapprovalId: true,
        updatedAt: true,
      },
    }),
  ])

  const proUsers = planCounts.find((row) => row.plan === Plan.PRO)?._count._all ?? 0
  const collectorUsers =
    planCounts.find((row) => row.plan === Plan.COLLECTOR)?._count._all ?? 0
  const activeSubs =
    subCounts.find((row) => row.subscriptionStatus === SubscriptionStatus.ACTIVE)
      ?._count._all ?? 0
  const pastDue =
    subCounts.find((row) => row.subscriptionStatus === SubscriptionStatus.PAST_DUE)
      ?._count._all ?? 0

  const counts = [
    { label: adminDict.totalUsers, value: String(totalUsers) },
    { label: adminDict.proUsers, value: String(proUsers) },
    { label: adminDict.collectorUsers, value: String(collectorUsers) },
    { label: adminDict.activeSubs, value: String(activeSubs) },
    { label: adminDict.pastDueSubs, value: String(pastDue) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight">
        {dict.admin.subscriptions}
      </h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {counts.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="size-4" aria-hidden="true" />
              {label}
            </div>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {dict.admin.recentSubs}
        </h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.admin.noSubscriptions}
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dict.admin.user}</TableHead>
                  <TableHead>{dict.admin.plan}</TableHead>
                  <TableHead>{dict.admin.status}</TableHead>
                  <TableHead>{dict.admin.provider}</TableHead>
                  <TableHead className="text-right">{dict.admin.lastUpdate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{sub.email}</span>
                        {sub.name && (
                          <span className="text-xs text-muted-foreground">
                            {sub.name}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {dict.app.planNames[sub.plan]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sub.subscriptionStatus ? (
                        <Badge
                          variant={
                            sub.subscriptionStatus === SubscriptionStatus.ACTIVE
                              ? "default"
                              : sub.subscriptionStatus === SubscriptionStatus.PAST_DUE
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {adminDict.sStatus[sub.subscriptionStatus]}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {sub.stripeSubscriptionId
                        ? "Stripe"
                        : sub.mpPreapprovalId
                          ? "Mercado Pago"
                          : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(sub.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}