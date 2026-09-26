import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { planPriceCents } from "@/lib/billing"
import { planFeatures, planName, type PlanRow, type Locale } from "@/lib/plans"
import type { Dictionary } from "@/messages/es"

export type PricingCard = {
  slug: string
  name: string
  price: string
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
    const priceCents = planPriceCents(plan.slug)
    const price =
      priceCents === null
        ? pricing.priceFree
        : `$${(priceCents / 100).toFixed(2)}`
    return {
      slug: plan.slug,
      name: planName(plan, locale),
      price,
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
    <div className="grid gap-6 md:grid-cols-3">
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
            className={cn(
              "relative flex flex-col",
              isPopular && "border-primary shadow-lg",
            )}
          >
            {isPopular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                {pricing.popular}
              </Badge>
            )}
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {plan.name}
                {isCurrent && (
                  <Badge variant="secondary">{pricing.yourPlan}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-6">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {pricing.monthly}
                </span>
              </div>
              <ul className="space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
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
                    variant: isPopular ? "default" : "outline",
                  }),
                  "w-full",
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