import type { Metadata } from "next"
import { lang } from "next/root-params"
import { PricingCards, buildPricingCards } from "@/components/site/pricing-cards"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"
import { getViewerPlan, listPlans } from "@/lib/plans"
import { buildAlternates, OG_LOCALE } from "@/lib/seo"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  return {
    // El title ya incluye la marca, así que no se le aplica el template.
    title: { absolute: dict.seo.pricingTitle },
    description: dict.seo.pricingDescription,
    alternates: buildAlternates(locale, "/pricing"),
    openGraph: {
      title: dict.seo.pricingTitle,
      description: dict.seo.pricingDescription,
      url: `/${locale}/pricing`,
      locale: OG_LOCALE[locale],
    },
    twitter: {
      card: "summary_large_image",
      title: dict.seo.pricingTitle,
      description: dict.seo.pricingDescription,
    },
  }
}

export default async function PricingPage() {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const localePrefix = `/${currentLocale}`
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  // Quién mira la página importa para el botón de cada tarjeta: sin esto, quien
  // ya está suscrito ve "Elegir plan" sobre su propio plan y el enlace lo
  // manda a registrarse otra vez. Sin sesión no se lee nada de la BD.
  const [currentPlan, plans] = await Promise.all([
    getViewerPlan(),
    listPlans({ activeOnly: true }),
  ])
  const cards = buildPricingCards({
    plans,
    pricing: dict.pricing,
    locale,
    currentPlan,
  })

  return (
    <div className="landing">
      <section className="landing__section landing__section--center">
        <h1 className="landing__title">{dict.pricing.title}</h1>
        <p className="landing__note">{dict.pricing.subtitle}</p>
      </section>
      <section className="landing__section">
        <PricingCards
          pricing={dict.pricing}
          cards={cards}
          paths={{
            signup: `${localePrefix}/signup`,
            billing: `${localePrefix}/app/billing`,
          }}
        />
      </section>
    </div>
  )
}