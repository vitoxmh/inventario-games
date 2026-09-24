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
import { PLAN_META } from "@/lib/billing"
import { planName, type PlanRow, type Locale } from "@/lib/plans"
import type { Dictionary } from "@/messages/es"

export type PricingCard = {
  name: string
  price: string
  features: string[]
}

export function buildPricingCards(args: {
  plans: PlanRow[]
  pricing: Dictionary["pricing"]
  locale: Locale
}): PricingCard[] {
  const { plans, pricing, locale } = args
  return plans.map((plan) => {
    const priceCents = PLAN_META[plan.slug]?.priceCents ?? null
    const price =
      priceCents === null
        ? pricing.priceFree
        : `$${(priceCents / 100).toFixed(2)}`
    const features = [
      plan.gameLimit === null
        ? pricing.gamesUnlimited
        : `${plan.gameLimit} ${pricing.games}`,
      `${plan.imageLimit} ${pricing.photosPerGame}`,
      ...(plan.paid ? [pricing.prioritySupport] : []),
    ]
    return {
      name: planName(plan, locale),
      price,
      features,
    }
  })
}

export function PricingCards({
  pricing,
  cards,
  href,
}: {
  pricing: Dictionary["pricing"]
  cards: PricingCard[]
  href: (name: string) => string
}) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {cards.map((plan, index) => {
        const isPopular = cards.length > 1 && index === Math.floor(cards.length / 2)
        return (
          <Card
            key={plan.name}
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
              <CardTitle>{plan.name}</CardTitle>
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
                href={href(plan.name)}
                className={cn(
                  buttonVariants({
                    variant: isPopular ? "default" : "outline",
                  }),
                  "w-full",
                )}
              >
                {pricing.cta}
              </Link>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}