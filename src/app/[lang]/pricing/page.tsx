import type { Metadata } from "next"
import { lang } from "next/root-params"
import { PricingCards, buildPricingCards } from "@/components/site/pricing-cards"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"
import { listPlans } from "@/lib/plans"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Pricing",
}

export default async function PricingPage() {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const localePrefix = `/${currentLocale}`
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  const plans = await listPlans({ activeOnly: true })
  const cards = buildPricingCards({ plans, pricing: dict.pricing, locale })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight">
          {dict.pricing.title}
        </h1>
        <p className="text-muted-foreground">{dict.pricing.subtitle}</p>
      </div>
      <PricingCards
        pricing={dict.pricing}
        cards={cards}
        href={(name) =>
          `${localePrefix}/signup?plan=${encodeURIComponent(name.toLowerCase())}`
        }
      />
    </div>
  )
}