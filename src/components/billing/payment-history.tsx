import { Receipt } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMinorCurrency } from "@/lib/money"
import { durationPeriodLabel } from "@/lib/plans"
import type { PaymentRow } from "@/lib/payment-history"
import type { Locale } from "@/lib/i18n/locales"
import type { Dictionary } from "@/messages/es"

/*
 * Historial de pagos del usuario. Server Component a propósito: son datos ya
 * decididos por el servidor (importe, periodo, plan) y no hay nada que el
 * navegador tenga que hacer aquí, así que ni se envía código al cliente ni se
 * pasa la lista por las props del `BillingClient` de abajo.
 *
 * Cada fila es una FOTO de un cobro (`amountMinor` en las unidades menores de la
 * moneda con la que se pagó, `durationDays` de los días que compró ese día), no
 * una referencia al plan de hoy: si el admin cambia el precio o la duración
 * mañana, la fila antigua sigue diciendo lo que se cobró y lo que dio.
 */

/** El bloque `billing` entero: las etiquetas de proveedor ya viven ahí y no se duplican. */
type PaymentsDict = Dictionary["billing"]

export function PaymentHistory({
  payments,
  planNames,
  dict,
  pricing,
  locale,
  total,
}: {
  payments: PaymentRow[]
  /** Nombre localizado de cada plan, resuelto por la página (el pago solo guarda el slug). */
  planNames: Record<string, string>
  dict: PaymentsDict
  pricing: Dictionary["pricing"]
  locale: Locale
  /** Hay más filas en la tabla que las que se pintan (ver `listUserPayments`). */
  total: number
}) {
  const dateFormat = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "es-ES",
    // UTC a propósito: la fecha se pinta en el servidor y sin `timeZone` saldría
    // con la zona del hosting (o con la del usuario si esto llegara a
    // hidratarse), así que un pago de la 01:00 cambiaría de día según dónde se
    // despliegue. Es un historial, no un reloj: mejor un día estable.
    { dateStyle: "medium", timeZone: "UTC" },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="size-4" aria-hidden="true" />
          {dict.payments.title}
        </CardTitle>
        <CardDescription>
          {payments.length > 0
            ? dict.payments.subtitle
            : dict.payments.empty}
        </CardDescription>
      </CardHeader>
      {payments.length > 0 && (
        <CardContent>
          <ul className="flex flex-col divide-y">
            {payments.map((payment) => {
              const amount = formatMinorCurrency(
                payment.amountMinor,
                payment.currency,
                locale,
              )
              const plan = planNames[payment.plan] ?? payment.plan
              return (
                <li
                  key={payment.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {plan}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        {durationPeriodLabel(payment.durationDays, pricing, locale)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {payment.provider === "mp"
                        ? dict.providerMercadoPago
                        : dict.providerStripe}
                      {" · "}
                      {payment.externalId}
                    </span>
                  </div>
                  <div className="flex flex-col sm:items-end">
                    <span className="text-sm font-medium">
                      {amount ?? dict.payments.amountUnknown}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dateFormat.format(payment.paidAt)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {total > payments.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              {dict.payments.limited}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
