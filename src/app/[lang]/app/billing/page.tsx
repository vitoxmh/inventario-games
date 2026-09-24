import type { Metadata } from "next"
import { lang } from "next/root-params"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlanLimit } from "@/lib/plans"
import { getEnabledProviders } from "@/lib/billing"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { BillingClient } from "@/components/billing/billing-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Facturación",
  robots: { index: false, follow: false },
}

export default async function BillingPage(
  props: PageProps<"/[lang]/app/billing">,
) {
  const dict = await getDictionary()
  const searchParams = await props.searchParams
  const currentLocale = await lang()
  const locale = currentLocale === "en" ? "en" : "es"

  const session = await auth()
  const userId = session?.user?.id ?? null
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          plan: true,
          subscriptionStatus: true,
        },
      })
    : null

  const count = userId
    ? await prisma.game.count({ where: { userId } })
    : 0
  const limit = user
    ? getPlanLimit(user.plan)
    : getPlanLimit("FREE")
  const providers = getEnabledProviders()
  const isSignedIn = Boolean(user)

  const rawCheckout = Array.isArray(searchParams?.checkout)
    ? searchParams.checkout[0]
    : searchParams?.checkout
  const checkout =
    rawCheckout === "success" || rawCheckout === "canceled"
      ? rawCheckout
      : null

  return (
    <BillingClient
      dict={dict.billing}
      planNames={dict.app.planNames}
      plan={user?.plan ?? "FREE"}
      subscriptionStatus={user?.subscriptionStatus ?? null}
      count={count}
      limit={limit}
      providers={isSignedIn ? providers : []}
      locale={locale}
      checkout={checkout}
    />
  )
}