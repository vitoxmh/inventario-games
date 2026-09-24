import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Dictionary } from "@/messages/es"

export async function PricingCards({
  pricing,
  href,
}: {
  pricing: Dictionary["pricing"]
  href: (name: string) => string
}) {

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {pricing.plans.map((plan, index) => {
        const isPopular = index === 1
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
              <CardDescription>{plan.description}</CardDescription>
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