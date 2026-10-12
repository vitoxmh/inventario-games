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
import { getViewerPlan, listPlans, type PlanRow } from "@/lib/plans"
import { absoluteUrl, buildAlternates, OG_LOCALE, safeJsonLd } from "@/lib/seo"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  return {
    // El title por defecto del layout ya trae marca y keywords; aquí fijamos la
    // description y las alternates de esta ruta.
    description: dict.seo.homeDescription,
    alternates: buildAlternates(locale),
    openGraph: {
      title: dict.seo.homeTitle,
      description: dict.seo.homeDescription,
      url: `/${locale}`,
      locale: OG_LOCALE[locale],
    },
    twitter: {
      card: "summary_large_image",
      title: dict.seo.homeTitle,
      description: dict.seo.homeDescription,
    },
  }
}

/*
 * Datos estructurados Schema.org. El precio sale de la fila del plan (la que
 * edita el admin en /admin/plans), no del nombre, que es texto editable, ni de
 * una constante de código. Los importes van como string con dos decimales
 * ("4.99"), nunca 4.9900000000000003 por coma flotante.
 *
 * Se marca el precio de Stripe, que es el de referencia en USD. Un plan de pago
 * sin precio se OMITE del marcado en vez de publicarse a 0: structured data con
 * precio 0 es peor que no tener oferta, porque dice "gratis" y no lo está.
 */
function buildJsonLd(args: {
  name: string
  description: string
  locale: string
  plans: PlanRow[]
}): string {
  const { name, description, locale, plans } = args
  const offers = plans
    .filter((plan) => !plan.paid || (plan.priceCents !== null && plan.priceCents > 0))
    .map((plan) => {
      const cents = plan.priceCents ?? 0
      return {
        "@type": "Offer",
        name: plan.slug,
        price: (cents / 100).toFixed(2),
        priceCurrency: "USD",
        category: "SaaS",
        availability: "https://schema.org/InStock",
        url: absoluteUrl(`/${locale}/pricing`),
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: (cents / 100).toFixed(2),
          priceCurrency: "USD",
          billingIncrement: 1,
          unitCode: "MON",
        },
      }
    })

  return safeJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": absoluteUrl(`/${locale}`),
        name,
        description,
        url: absoluteUrl(`/${locale}`),
        inLanguage: locale,
      },
      {
        "@type": "SoftwareApplication",
        "@id": absoluteUrl(`/${locale}#app`),
        name,
        description,
        url: absoluteUrl(`/${locale}`),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        inLanguage: locale,
        offers: offers.length > 0 ? offers : undefined,
      },
    ],
  })
}

const featureIcons = [
  Camera,
  Search,
  LineChart,
  FileDown,
  Cloud,
  Lock,
] as const

// Ver la nota del bloque de planes en el JSX. Los precios no están a la venta
// todavía; /pricing sigue publicada.
const SHOW_PRICING_SECTION = false

export default async function HomePage() {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const localePrefix = `/${currentLocale}`
  const locale = isLocale(currentLocale) ? currentLocale : "es"
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
  const jsonLd = buildJsonLd({
    name: dict.site.name,
    description: dict.seo.homeDescription,
    locale,
    plans,
  })

  return (
    <>
      {/*
        JSON-LD como hijo de texto: React lo serializa tal cual y safeJsonLd()
        ya ha escapado <, > y &, así que no puede aparecer un </script> que
        cierre el bloque. Evita dangerouslySetInnerHTML (prohibido en el repo).
      */}
      <script type="application/ld+json">{jsonLd}</script>
      <div className="landing">
      <section className="landing__section landing__section--center">
        <Badge variant="secondary" className="u-cluster u-cluster--tight">
          <Gamepad2 className="u-icon" aria-hidden="true" />
          {dict.hero.badge}
        </Badge>
        <h1 className="landing__title">
          {dict.hero.title}
        </h1>
        <p className="landing__lead">
          {dict.hero.subtitle}
        </p>
        <div className="landing__actions">
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
        className="landing__section landing__section--spaced"
      >
        <div className="landing__section--center">
          <h2 className="landing__heading">
            {dict.features.title}
          </h2>
          <p className="landing__note">{dict.features.intro}</p>
        </div>
        <div className="landing__features">
          {dict.features.items.map((feature, index) => {
            const Icon = featureIcons[index]
            return (
              <div
                key={feature.title}
                className="feature"
              >
                <span className="feature__icon">
                  <Icon aria-hidden="true" />
                </span>
                <h3 className="feature__title">{feature.title}</h3>
                <p className="feature__text">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/*
        BLOQUE DE PLANES OCULTO TEMPORALMENTE (2026-09): los planes todavía no
        están a la venta, así que el home no muestra precios ni tarjetas (ni
        siquiera "Disponible pronto"). La página /pricing, su entrada en el
        sitemap y los Offers del JSON-LD siguen activos: solo se oculta la
        información dentro del home. Para volver a mostrarla, pon a true.
      */}
      {SHOW_PRICING_SECTION && (
        <section className="landing__section landing__section--spaced">
          <Separator />
          <div className="landing__section--center">
            <h2 className="landing__heading">
              {dict.pricing.title}
            </h2>
            <p className="landing__note">{dict.pricing.subtitle}</p>
          </div>
          <PricingCards
            pricing={dict.pricing}
            cards={cards}
            paths={{
              signup: `${localePrefix}/signup`,
              billing: `${localePrefix}/app/billing`,
            }}
          />
        </section>
      )}

      <section className="landing__section landing__section--center">
        <h2 className="landing__subheading">
          {dict.cta.title}
        </h2>
        <p className="landing__note">{dict.cta.subtitle}</p>
        <Link
          href={`${localePrefix}/signup`}
          className={buttonVariants({ size: "lg" })}
        >
          {dict.cta.button}
        </Link>
      </section>
      </div>
    </>
  )
}