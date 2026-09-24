import type { Metadata } from "next"
import { lang } from "next/root-params"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlan, planName } from "@/lib/plans"
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

  const planSlug = user?.plan ?? "FREE"
  const [count, imageCount, planRow] = await Promise.all([
    userId ? prisma.game.count({ where: { userId } }) : Promise.resolve(0),
    userId
      ? prisma.gameImage.count({ where: { game: { userId } } })
      : Promise.resolve(0),
    getPlan(planSlug),
  ])
  const limit = planRow?.gameLimit ?? null
  const imageLimit = planRow?.imageLimit ?? 1
  const providers = getEnabledProviders()
  const isSignedIn = Boolean(user)

  const rawCheckout = Array.isArray(searchParams?.checkout)
    ? searchParams.checkout[0]
    : searchParams?.checkout
  const checkout =
    rawCheckout === "success" || rawCheckout === "canceled"
      ? rawCheckout
      : null

  const planLabel = planRow ? planName(planRow, locale) : planSlug

  return (
    <BillingClient
      dict={dict.billing}
      planName={planLabel}
      plan={planSlug}
      subscriptionStatus={user?.subscriptionStatus ?? null}
      count={count}
      limit={limit}
      imageCount={imageCount}
      imageLimit={imageLimit}
      providers={isSignedIn ? providers : []}
      locale={locale}
      checkout={checkout}
    />
  )
}