import type { Metadata } from "next"
import { lang } from "next/root-params"
import { prisma } from "@/lib/db"
import { AdminUsersClient } from "@/components/admin/admin-users-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  title: "Usuarios",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  const [users, total, plans] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        bannedAt: true,
        emailVerifiedAt: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { games: true } },
      },
    }),
    prisma.user.count(),
    prisma.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      select: { slug: true, nameEs: true, nameEn: true, active: true },
    }),
  ])

  return (
    <AdminUsersClient
      initialUsers={users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        role: user.role,
        bannedAt: user.bannedAt?.toISOString() ?? null,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        subscriptionStatus: user.subscriptionStatus,
        createdAt: user.createdAt.toISOString(),
        gameCount: user._count.games,
      }))}
      initialTotal={total}
      plans={plans.map((plan) => ({
        slug: plan.slug,
        label: (locale === "en" ? plan.nameEn : plan.nameEs) || plan.slug,
        active: plan.active,
      }))}
      dict={dict.admin}
    />
  )
}