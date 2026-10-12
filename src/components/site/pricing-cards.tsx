import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  planFeatures,
  planName,
  planPeriodLabel,
  type PlanRow,
  type Locale,
} from "@/lib/plans"
import type { Dictionary } from "@/messages/es"

export type PricingCard = {
  slug: string
  name: string
  price: string
  /** Sufijo del precio ("/mes", "/90 días"): el periodo real del plan. */
  period: string
  features: string[]
  /**
   * Qué botón lleva esta tarjeta. Lo decide el SERVIDOR (que sabe si hay
   * sesión y cuál es el plan de quien visita), nunca el texto de la tarjeta:
   *  - "current": es su plan, se marca como tal y el botón lleva a la
   *    facturación, no a una compra.
   *  - "billing": tiene cuenta y este es otro plan, así que la compra se hace
   *    en la facturación (el checkout exige sesión).
   *  - "signup": visita sin cuenta, el alta es lo que hay que ofrecer.
   */
  action: "current" | "billing" | "signup"
}

export function buildPricingCards(args: {
  plans: PlanRow[]
  pricing: Dictionary["pricing"]
  locale: Locale
  /** Plan de quien visita la página, o `null`/`undefined` si no hay sesión. */
  currentPlan?: string | null
}): PricingCard[] {
  const { plans, pricing, locale, currentPlan = null } = args
  return plans.map((plan) => {
    /*
     * El precio sale de la fila del plan (lo edita el admin en /admin/plans), no
     * de una constante ni del entorno. Aquí se pinta el de Stripe, que es la
     * referencia worldwide; la página de facturación, que ya sabe qué proveedor
     * va a usar cada uno, pinta el importe en la moneda de ese proveedor.
     *
     * Un plan de pago sin precio NO se pinta como "$0": no se está regalando,
     * sencillamente aún no tiene precio configurado, y decirlo es lo honesto.
     */
    const price =
      plan.priceCents === null || plan.priceCents <= 0
        ? plan.paid
          ? pricing.priceUnavailable
          : pricing.priceFree
        : `$${(plan.priceCents / 100).toFixed(2)}`
    return {
      slug: plan.slug,
      name: planName(plan, locale),
      price,
      period: planPeriodLabel(plan, pricing, locale),
      features: planFeatures(plan, pricing),
      action: !currentPlan
        ? ("signup" as const)
        : plan.slug === currentPlan
          ? ("current" as const)
          : ("billing" as const),
    }
  })
}

export function PricingCards({
  pricing,
  cards,
  paths,
}: {
  pricing: Dictionary["pricing"]
  cards: PricingCard[]
  /** Rutas base ya prefijadas con el idioma; el destino se elige por `action`. */
  paths: { signup: string; billing: string }
}) {
  return (
    <div className="plans">
      {cards.map((plan, index) => {
        const isPopular = cards.length > 1 && index === Math.floor(cards.length / 2)
        const isCurrent = plan.action === "current"
        /*
         * Con sesión, comprar o cambiar de plan es cosa de la facturación (allí
         * está el checkout con el proveedor): mandar a alguien que ya tiene
         * cuenta a /signup sería ofrecerle una segunda. El `?plan=` solo lo
         * consume el alta, y lleva el slug en minúsculas, no el nombre editable
         * del plan.
         */
        const href =
          plan.action === "signup"
            ? `${paths.signup}?plan=${encodeURIComponent(plan.slug.toLowerCase())}`
            : paths.billing
        const label = plan.action === "signup" ? pricing.cta : pricing.managePlan
        return (
          <Card
            key={plan.slug}
            className={cn("plan", isPopular && "plan--popular")}
          >
            {isPopular && (
              <Badge className="plan__flag">{pricing.popular}</Badge>
            )}
            <CardHeader>
              <CardTitle className="plan__title">
                {plan.name}
                {isCurrent && (
                  <Badge variant="secondary">{pricing.yourPlan}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="plan__body">
              <div className="plan__price">
                <span className="plan__amount">{plan.price}</span>
                <span className="plan__period">{plan.period}</span>
              </div>
              <ul className="plan__features">
                {plan.features.map((feature) => (
                  <li key={feature} className="plan__feature">
                    <Check className="plan__check" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link
                href={href}
                className={cn(
                  buttonVariants({
                    variant: isPopular ? "primary" : "outline",
                  }),
                  "u-full",
                )}
              >
                {label}
              </Link>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}