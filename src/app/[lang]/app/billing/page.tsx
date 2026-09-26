import type { Metadata } from "next"
import { lang } from "next/root-params"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlan, listPlans, planFeatures, planName } from "@/lib/plans"
import {
  activeProviderFor,
  formatPriceForProvider,
  isUpgrade,
  PAID_PLANS,
  type Provider,
} from "@/lib/billing"
import { getAvailableProviders } from "@/lib/payment-providers"
import { settlePendingMpCheckoutsForUser } from "@/lib/mp-settlement"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { BillingClient, type BillingTier } from "@/components/billing/billing-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Facturación",
  robots: { index: false, follow: false },
}

export default async function BillingPage(
  props: PageProps<"/[lang]/app/billing">,
) {
  const dict = await getDictionary()
  const searchParams = await props.searchParams
  const currentLocale = await lang()
  const locale = currentLocale === "en" ? "en" : "es"

  const session = await auth()
  const userId = session?.user?.id ?? null

  /*
   * Liquidación perezosa de Mercado Pago. La notificación del webhook es el camino
   * normal para conceder un plan, pero si no llega (o llega con la firma
   * rechazada) el pago se queda pagado en MP y sin conceder aquí. Antes de leer la
   * fila del usuario se repregunta a MP por sus orders sin resolver, de modo que el
   * plan que ve en pantalla ya sea el que MP tiene registrado.
   *
   * Solo se ejecuta con sesión, y filtra por el `userId` de esa sesión: sin sesión
   * no hay nada que liquidar y no se llama a la API de MP. Un fallo aquí no puede
   * romper la página (la liquidación traga sus errores), y es idempotente: una vez
   * resuelta, la order deja de entrar en la consulta.
   */
  if (userId) {
    await settlePendingMpCheckoutsForUser(userId)
  }

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          plan: true,
          subscriptionStatus: true,
          stripeSubscriptionId: true,
          mpLastChargeAt: true,
        },
      })
    : null

  const planSlug = user?.plan ?? "FREE"
  const [count, imageCount, planRow, paidRows] = await Promise.all([
    userId ? prisma.game.count({ where: { userId } }) : Promise.resolve(0),
    userId
      ? prisma.gameImage.count({ where: { game: { userId } } })
      : Promise.resolve(0),
    getPlan(planSlug),
    listPlans({ activeOnly: true }),
  ])
  const limit = planRow?.gameLimit ?? null
  const imageLimit = planRow?.imageLimit ?? 1
  // Medios de pago que se ofrecen: los que el admin tiene encendidos y tienen
  // credenciales en el entorno. Con suscripción activa el selector se oculta y
  // manda el proveedor de la suscripción (ver `BillingClient`).
  const providers = await getAvailableProviders()
  const isSignedIn = Boolean(user)

  // Suscripción viva = estado ACTIVE **y** una suscripción externa real. Sin
  // las dos cosas no se puede mejorar (el upgrade se aplica sobre la
  // suscripción del proveedor, no sobre el `plan` de la fila), así que la
  // tarjeta cae en "suscribirse" en vez de prometer un botón que el servidor
  // terminaría rechazando con 409.
  const activeProvider: Provider | null =
    user?.subscriptionStatus === "ACTIVE"
      ? activeProviderFor({
          stripeSubscriptionId: user.stripeSubscriptionId,
          mpLastChargeAt: user.mpLastChargeAt,
        })
      : null

  /*
   * Escalera de la página: solo los planes de pago, en el orden de
   * `PAID_PLANS` (Free -> Coleccionista -> Pro) y recortando los niveles
   * inferiores al actual (esta pantalla es para subir, no para bajar). La
   * acción de cada tarjeta la decide el servidor; el cliente solo la pinta.
   */
  const rowsBySlug = new Map(paidRows.map((row) => [row.slug, row]))
  const tiers: BillingTier[] = PAID_PLANS.flatMap((slug) => {
    const row = rowsBySlug.get(slug)
    if (!row) return []
    const isCurrent = row.slug === planSlug
    if (!isCurrent && !isUpgrade(planSlug, slug)) return []
    return [
      {
        slug,
        name: planName(row, locale),
        // Importe en la moneda de cada proveedor (MP cobra en CLP/ARS/MXN...).
        // El cliente pinta el del proveedor elegido; si un proveedor no está
        // configurado, su precio es `null` y no se muestra.
        prices: {
          stripe: formatPriceForProvider({ slug, provider: "stripe", locale }),
          mp: formatPriceForProvider({ slug, provider: "mp", locale }),
        },
        features: planFeatures(row, dict.pricing),
        action: isCurrent
          ? ("current" as const)
          : activeProvider
            ? ("upgrade" as const)
            : ("subscribe" as const),
      },
    ]
  })

  const rawCheckout = Array.isArray(searchParams?.checkout)
    ? searchParams.checkout[0]
    : searchParams?.checkout
  const checkout =
    rawCheckout === "success" || rawCheckout === "canceled"
      ? rawCheckout
      : null

  const planLabel = planRow ? planName(planRow, locale) : planSlug

  return (
    <BillingClient
      dict={dict.billing}
      pricing={dict.pricing}
      planName={planLabel}
      subscriptionStatus={user?.subscriptionStatus ?? null}
      count={count}
      limit={limit}
      imageCount={imageCount}
      imageLimit={imageLimit}
      tiers={tiers}
      providers={isSignedIn ? providers : []}
      activeProvider={activeProvider}
      locale={locale}
      checkout={checkout}
    />
  )
}
