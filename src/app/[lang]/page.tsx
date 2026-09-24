import Link from "next/link"
import { lang } from "next/root-params"
import {
  Camera,
  Cloud,
  FileDown,
  Gamepad2,
  LineChart,
  Lock,
  Search,
} from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PricingCards, buildPricingCards } from "@/components/site/pricing-cards"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"
import { listPlans } from "@/lib/plans"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  return {
    description: dict.hero.subtitle,
    alternates: {
      canonical: `/${locale}`,
      languages: { es: "/es", en: "/en" },
    },
    openGraph: {
      title: dict.site.name,
      description: dict.hero.subtitle,
      url: `/${locale}`,
      locale,
    },
  }
}

const featureIcons = [
  Camera,
  Search,
  LineChart,
  FileDown,
  Cloud,
  Lock,
] as const

export default async function HomePage() {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const localePrefix = `/${currentLocale}`
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  const plans = await listPlans({ activeOnly: true })
  const cards = buildPricingCards({ plans, pricing: dict.pricing, locale })

  return (
    <div className="flex flex-col gap-24 pb-24">
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 pt-24 text-center sm:px-6">
        <Badge variant="secondary" className="gap-1.5">
          <Gamepad2 className="size-3.5" aria-hidden="true" />
          {dict.hero.badge}
        </Badge>
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          {dict.hero.title}
        </h1>
        <p className="max-w-xl text-pretty text-lg text-muted-foreground">
          {dict.hero.subtitle}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`${localePrefix}/signup`}
            className={buttonVariants({ size: "lg" })}
          >
            {dict.hero.primaryCta}
          </Link>
          <Link
            href={`${localePrefix}/pricing`}
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            {dict.hero.secondaryCta}
          </Link>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight">
            {dict.features.title}
          </h2>
          <p className="text-muted-foreground">{dict.features.intro}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {dict.features.items.map((feature, index) => {
            const Icon = featureIcons[index]
            return (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-xl border p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Separator />
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight">
            {dict.pricing.title}
          </h2>
          <p className="text-muted-foreground">{dict.pricing.subtitle}</p>
        </div>
        <PricingCards
          pricing={dict.pricing}
          cards={cards}
          href={(name) => `${localePrefix}/signup?plan=${encodeURIComponent(name.toLowerCase())}`}
        />
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight">
          {dict.cta.title}
        </h2>
        <p className="text-muted-foreground">{dict.cta.subtitle}</p>
        <Link
          href={`${localePrefix}/signup`}
          className={buttonVariants({ size: "lg" })}
        >
          {dict.cta.button}
        </Link>
      </section>
    </div>
  )
}