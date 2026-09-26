"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Dictionary } from "@/messages/es"

type AdminDict = Dictionary["admin"]

type Provider = "stripe" | "mp"

/*
 * `available` es lo que ve el cliente (configurado y encendido) y `enabled` es
 * solo el interruptor del admin: se muestran por separado para que quede claro
 * que apagar el interruptor no borra las credenciales del despliegue.
 */
type ProviderRow = {
  provider: Provider
  configured: boolean
  enabled: boolean
  available: boolean
  missingEnv: string[]
}

export function AdminPaymentsClient({
  initialProviders,
  labels,
  dict,
}: {
  initialProviders: ProviderRow[]
  labels: Record<Provider, string>
  dict: AdminDict
}) {
  const [providers, setProviders] = useState<ProviderRow[]>(initialProviders)
  const [pending, startMutation] = useTransition()

  function toggle(row: ProviderRow, enabled: boolean) {
    startMutation(async () => {
      const res = await fetch("/api/admin/payment-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: row.provider, enabled }),
      })
      if (!res.ok) {
        toast.error(dict.saveError)
        return
      }
      // El servidor devuelve la lista ya recalculada: el estado del cliente
      // nunca calcula disponibilidad por su cuenta.
      const data = (await res.json()) as { providers: ProviderRow[] }
      setProviders(data.providers)
      toast.success(dict.saved)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{dict.payments}</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        {dict.paymentsHint}
      </p>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.provider}</TableHead>
              <TableHead>{dict.status}</TableHead>
              <TableHead className="text-right">{dict.paymentsEnabled}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((row) => (
              <TableRow key={row.provider}>
                <TableCell>
                  <span className="font-medium">{labels[row.provider]}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {row.available ? (
                      <Badge variant="default">{dict.paymentsAvailable}</Badge>
                    ) : row.enabled ? (
                      <Badge variant="secondary">
                        {dict.paymentsMissingConfig}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{dict.paymentsOff}</Badge>
                    )}
                    {!row.configured && (
                      <span className="text-xs text-muted-foreground">
                        {dict.paymentsMissingEnv}
                        {row.missingEnv.join(", ")}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      {row.enabled ? dict.active : dict.inactive}
                    </span>
                    <Switch
                      checked={row.enabled}
                      disabled={pending || !row.configured}
                      onCheckedChange={(checked) =>
                        toggle(row, checked ?? false)
                      }
                      aria-label={labels[row.provider]}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
