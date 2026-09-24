"use client"

import { useState } from "react"
import { CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "cn"

export type Provider = "stripe" | "mp"

type BillingDict = {
  [K in
    | "title"
    | "subtitle"
    | "currentPlan"
    | "statusActive"
    | "statusPastDue"
    | "statusCanceled"
    | "statusTrialing"
    | "statusInactive"
    | "usage"
    | "usageOf"
    | "usageUnlimited"
    | "usageImages"
    | "usagePerGame"
    | "plansTitle"
    | "proName"
    | "proPrice"
    | "proFeature"
    | "collectorName"
    | "collectorPrice"
    | "collectorFeature"
    | "subscribe"
    | "upgrade"
    | "manageSubscription"
    | "processing"
    | "stripeNotConfigured"
    | "successBanner"
    | "canceledBanner"
    | "loginToSubscribe"
    | "providerStripe"
    | "providerMercadoPago"
    | "paymentWith"
    | "alreadyActive"
    | "mpNoPortal"]: string
}

type BillingClientProps = {
  dict: BillingDict
  planName: string
  plan: string
  subscriptionStatus: string | null
  count: number
  limit: number | null
  imageCount: number
  imageLimit: number
  providers: Provider[]
  locale: "es" | "en"
  checkout: string | null
}

const STATUS_LABEL_KEYS: Record<string, keyof BillingDict> = {
  ACTIVE: "statusActive",
  PAST_DUE: "statusPastDue",
  CANCELED: "statusCanceled",
  TRIALING: "statusTrialing",
  INACTIVE: "statusInactive",
}

const PROVIDER_LABELS: Record<Provider, keyof BillingDict> = {
  stripe: "providerStripe",
  mp: "providerMercadoPago",
}

const PLAN_PRICES = {
  PRO: { name: "proName", price: "proPrice", feature: "proFeature" },
  COLLECTOR: {
    name: "collectorName",
    price: "collectorPrice",
    feature: "collectorFeature",
  },
} as const satisfies Record<
  string,
  { name: keyof BillingDict; price: keyof BillingDict; feature: keyof BillingDict }
>

export function BillingClient({
  dict,
  planName,
  plan,
  subscriptionStatus,
  count,
  limit,
  imageCount,
  imageLimit,
  providers,
  locale,
  checkout,
}: BillingClientProps) {
  const [busy, setBusy] = useState<null | "checkout" | "manage">(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider>(providers[0] ?? "stripe")

  const isActive = subscriptionStatus === "ACTIVE"
  const hasProviders = providers.length > 0
  const canManage = isActive && providers.includes("stripe")

  async function submit(kind: "checkout" | "manage", targetPlan?: string) {
    setBusy(kind)
    setError(null)
    try {
      const endpoint =
        kind === "manage"
          ? "/api/billing/portal"
          : "/api/billing/checkout"
      const body: Record<string, unknown> = { locale, provider }
      if (targetPlan) body.plan = targetPlan
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.error === "already_active") {
        setError(dict.alreadyActive)
        return
      }
      if (!res.ok || !data.url) {
        setError(dict.stripeNotConfigured)
        return
      }
      window.location.assign(data.url)
    } catch {
      setError(dict.stripeNotConfigured)
    }
  }

  const usageText =
    limit === null
      ? `${count} ${dict.usageOf} ${dict.usageUnlimited}`
      : `${count} ${dict.usageOf} ${limit} ${dict.usage}`

  const statusLabel =
    subscriptionStatus === null
      ? null
      : dict[STATUS_LABEL_KEYS[subscriptionStatus] ?? "statusInactive"]

  const percent =
    limit === null ? 100 : Math.min(100, Math.round((count / (limit || 1)) * 100))

  return (
    <div className="flex flex-col gap-8">
      {checkout === "success" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {dict.successBanner}
        </div>
      )}
      {checkout === "canceled" && (
        <div className="rounded-lg border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {dict.canceledBanner}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{dict.currentPlan}</CardTitle>
          <CardDescription>
            {planName}
            {statusLabel ? ` · ${statusLabel}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{dict.usage}</span>
              <span className="font-medium">{usageText}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{dict.usageImages}</span>
            <span className="font-medium">
              {imageCount} {dict.usageOf} {imageLimit} {dict.usagePerGame}
            </span>
          </div>

          {canManage && (
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void submit("manage")}
            >
              {busy === "manage"
                ? dict.processing
                : dict.manageSubscription}
            </Button>
          )}
          {isActive && !canManage && (
            <p className="text-sm text-muted-foreground">{dict.mpNoPortal}</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {!isActive && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{dict.plansTitle}</h2>

          {!hasProviders && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {dict.stripeNotConfigured}
            </div>
          )}

          {hasProviders && (
            <>
              {providers.length > 1 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {dict.paymentWith}
                  </span>
                  <div className="flex gap-2">
                    {providers.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setProvider(p)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                          provider === p
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-muted text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        <CreditCard className="size-4" />
                        {dict[PROVIDER_LABELS[p]]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {(["PRO", "COLLECTOR"] as const).map((p) => (
                  <Card key={p}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {dict[PLAN_PRICES[p].name]}
                        {p === plan && (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {dict.currentPlan}
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-2xl font-semibold text-foreground">
                        {dict[PLAN_PRICES[p].price]}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <p className="text-sm text-muted-foreground">
                        {dict[PLAN_PRICES[p].feature]}
                      </p>
                      <Button
                        type="button"
                        variant={p === plan ? "outline" : "default"}
                        disabled={busy !== null}
                        onClick={() => void submit("checkout", p)}
                      >
                        {p === plan
                          ? dict.subscribe
                          : `${dict.upgrade} ${dict[PLAN_PRICES[p].name]}`}
                        {busy === "checkout" && (
                          <span className="ml-2">{dict.processing}</span>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        <CreditCard className="mr-1 inline size-4 align-text-bottom" />
        Stripe · Mercado Pago
      </p>
    </div>
  )
}