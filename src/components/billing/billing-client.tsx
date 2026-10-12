"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, CreditCard, Settings, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type Provider = "stripe" | "mp"

/*
 * Un nivel de la escalera. El servidor decide la `action` (qué botón toca):
 * el cliente no sabe nada de precios, límites ni de si un cambio es una
 * subida o una bajada.
 */
export type BillingTier = {
  slug: string
  name: string
  /** Importe ya formateado por proveedor: MP cobra en su moneda local. */
  prices: Partial<Record<Provider, string | null>>
  /** Sufijo del importe ("/mes", "/90 días"): el periodo real del plan. */
  period: string
  features: string[]
  action: "current" | "upgrade" | "subscribe"
}

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
    | "subscribe"
    | "upgrade"
    | "upgradeDone"
    | "manageSubscription"
    | "cancelSubscription"
    | "cancelDone"
    | "processing"
    | "stripeNotConfigured"
    | "successBanner"
    | "canceledBanner"
    | "loginToSubscribe"
    | "providerStripe"
    | "providerMercadoPago"
    | "paymentWith"
    | "alreadyActive"
    | "notAnUpgrade"
    | "noActiveSubscription"
    | "cardError"
    | "planUnavailable"
    | "mpPeriodActive"
    | "upgradeFailed"]:string
}

type BillingClientProps = {
  dict: BillingDict
  planName: string
  subscriptionStatus: string | null
  count: number
  limit: number | null
  imageCount: number
  imageLimit: number
  tiers: BillingTier[]
  providers: Provider[]
  activeProvider: Provider | null
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

/* Errores del servidor traducidos a un mensaje que el usuario entienda. */
const ERROR_LABEL_KEYS: Record<string, keyof BillingDict> = {
  already_active: "alreadyActive",
  not_an_upgrade: "notAnUpgrade",
  no_active_subscription: "noActiveSubscription",
  card_error: "cardError",
  plan_unavailable: "planUnavailable",
  mp_period_active: "mpPeriodActive",
  subscription_not_updatable: "upgradeFailed",
}

export function BillingClient({
  dict,
  planName,
  subscriptionStatus,
  count,
  limit,
  imageCount,
  imageLimit,
  tiers,
  providers,
  activeProvider,
  locale,
  checkout,
}: BillingClientProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | string>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider>(providers[0] ?? "stripe")
  const isActive = subscriptionStatus === "ACTIVE"
  const hasProviders = providers.length > 0
  // Con Stripe hay portal de autogestión. En MP no hay portal, pero desde la app
  // se puede cancelar (el servidor suelta el plan y no cobra el mes siguiente),
  // así que también hay botón: lo que cambia es la etiqueta.
  const canManage = isActive
  // Con suscripción activa el proveedor no se elige: manda el que ya tiene la
  // suscripción, y por tanto el precio que se muestra debe ser ese (MP cobra
  // en su moneda, no en USD).
  const shownProvider: Provider = activeProvider ?? provider

  const priceFor = (tier: BillingTier): string =>
    tier.prices[shownProvider] ?? tier.prices.stripe ?? ""

  async function submit(
    endpoint: "/api/billing/checkout" | "/api/billing/portal" | "/api/billing/upgrade",
    body: Record<string, unknown>,
  ) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      url?: string | null
      error?: string
      pending?: boolean
    }
    return { ok: res.ok, data }
  }

  async function subscribe(tier: BillingTier) {
    setBusy(tier.slug)
    setError(null)
    try {
      const { ok, data } = await submit("/api/billing/checkout", {
        locale,
        provider,
        plan: tier.slug,
      })
      if (!ok || !data.url) {
        setError(errorMessage(dict, data.error))
        return
      }
      // Stripe devuelve la URL de su checkout; MP devuelve la vuelta al
      // billing, donde el plan ya se leyó de la BD.
      window.location.assign(data.url)
    } catch {
      setError(dict.stripeNotConfigured)
    } finally {
      setBusy(null)
    }
  }

  async function upgrade(tier: BillingTier) {
    setBusy(tier.slug)
    setError(null)
    try {
      const { ok, data } = await submit("/api/billing/upgrade", {
        locale,
        plan: tier.slug,
      })
      if (!ok) {
        setError(errorMessage(dict, data.error))
        return
      }
      // Stripe actualiza la suscripción en el acto, así que no hay URL a la que
      // ir. En MP subir de plan ES pagar el plan nuevo: el servidor devuelve la
      // `checkout_url` de esa order y el plan entra cuando se apruebe.
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      toast.success(dict.upgradeDone)
      // El plan vive en BD: se vuelve a pedirlo al servidor.
      router.refresh()
    } catch {
      setError(dict.stripeNotConfigured)
    } finally {
      setBusy(null)
    }
  }

  async function manage() {
    setBusy("portal")
    setError(null)
    const provider = activeProvider ?? "stripe"
    try {
      const { ok, data } = await submit("/api/billing/portal", {
        locale,
        provider,
      })
      if (!ok || !data.url) {
        setError(errorMessage(dict, data.error))
        return
      }
      // En MP no hay portal: la autogestión es cancelar, que solo significa "no
      // me cobres el mes que viene". El servidor suelta el plan y devuelve la
      // vuelta al billing, así que se avisa y se recarga.
      if (provider === "mp") {
        toast.success(dict.cancelDone)
        router.refresh()
        return
      }
      window.location.assign(data.url)
    } catch {
      setError(dict.stripeNotConfigured)
    } finally {
      setBusy(null)
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
    <div className="billing">
      {checkout === "success" && (
        <div className="notice notice--success">
          {dict.successBanner}
        </div>
      )}
      {checkout === "canceled" && (
        <div className="notice notice--muted">
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
        <CardContent className="u-stack u-stack--lg">
          <div className="billing__usage">
            <div className="billing__usage-head">
              <span className="u-muted">{dict.usage}</span>
              <span className="billing__usage-value">{usageText}</span>
            </div>
            <div className="billing__usage-bar">
              <div
                className="billing__usage-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="billing__usage-row">
            <span className="u-muted">{dict.usageImages}</span>
            <span className="billing__usage-value">
              {imageCount} {dict.usageOf} {imageLimit} {dict.usagePerGame}
            </span>
          </div>

          {canManage && (
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void manage()}
            >
              <Settings aria-hidden="true" />
              {busy === "portal"
                ? dict.processing
                : activeProvider === "mp"
                  ? dict.cancelSubscription
                  : dict.manageSubscription}
            </Button>
          )}
          {error && <p className="field-error">{error}</p>}
        </CardContent>
      </Card>

      {tiers.length > 0 && (
        <div className="billing__plans">
          <h2 className="billing__plans-title">{dict.plansTitle}</h2>

          {!isActive && !hasProviders && (
            <div className="empty empty--sm">{dict.stripeNotConfigured}</div>
          )}

          {!isActive && hasProviders && providers.length > 1 && (
            <div className="u-stack">
              <span className="u-sm u-strong u-muted">{dict.paymentWith}</span>
              <div className="u-cluster u-cluster--tight">
                {providers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={cn(
                      "provider-toggle",
                      provider === p ? "provider-toggle--on" : "provider-toggle--off",
                    )}
                  >
                    <CreditCard className="u-icon" />
                    {dict[PROVIDER_LABELS[p]]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="billing__grid">
            {tiers.map((tier) => {
              const isCurrent = tier.action === "current"
              const isUpgrade = tier.action === "upgrade"
              // Sin proveedor configurado los botones no llevan a ninguna parte:
              // el aviso de arriba ya lo dice.
              const disabled = busy !== null || !hasProviders
              return (
                <Card
                  key={tier.slug}
                  className={cn(
                    "billing__tier",
                    isUpgrade && "billing__tier--upgrade",
                  )}
                >
                  <CardHeader>
                    <CardTitle className="billing__tier-title">
                      {tier.name}
                      {isCurrent && (
                        <Badge variant="outline">{dict.currentPlan}</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="billing__tier-price">
                      {priceFor(tier)}
                      <span className="billing__tier-period">
                        {" "}
                        {tier.period}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="u-stack u-stack--lg">
                    <ul className="billing__features">
                      {tier.features.map((feature) => (
                        <li key={feature} className="billing__feature">
                          <Check aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <Button type="button" variant="outline" disabled>
                        {dict.currentPlan}
                      </Button>
                    ) : isUpgrade ? (
                      <Button
                        type="button"
                        disabled={disabled}
                        onClick={() => void upgrade(tier)}
                      >
                        <Sparkles aria-hidden="true" />
                        {dict.upgrade} {tier.name}
                        {busy === tier.slug && (
                          <span className="billing__pending">{dict.processing}</span>
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={disabled}
                        onClick={() => void subscribe(tier)}
                      >
                        {dict.subscribe}
                        {busy === tier.slug && (
                          <span className="billing__pending">{dict.processing}</span>
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <p className="billing__footprint">
        <CreditCard aria-hidden="true" />
        Stripe · Mercado Pago
      </p>
    </div>
  )
}

function errorMessage(dict: BillingDict, code: string | undefined): string {
  if (code && code in ERROR_LABEL_KEYS) return dict[ERROR_LABEL_KEYS[code]]
  return dict.stripeNotConfigured
}
