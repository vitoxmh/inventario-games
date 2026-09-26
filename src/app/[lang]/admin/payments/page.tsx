import type { Metadata } from "next"
import { AdminPaymentsClient } from "@/components/admin/admin-payments-client"
import { listProviderAvailability } from "@/lib/payment-providers"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Medios de pago",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminPaymentsPage() {
  const dict = await getDictionary()

  const providers = await listProviderAvailability()

  // El nombre de cada proveedor sale del diccionario de facturación (donde ya
  // vive, en los dos idiomas) en vez de duplicarlo aquí.
  const labels = {
    stripe: dict.billing.providerStripe,
    mp: dict.billing.providerMercadoPago,
  }

  return (
    <AdminPaymentsClient
      initialProviders={providers.map((row) => ({
        provider: row.provider,
        configured: row.configured,
        enabled: row.enabled,
        available: row.available,
        missingEnv: row.missingEnv,
      }))}
      labels={labels}
      dict={dict.admin}
    />
  )
}
