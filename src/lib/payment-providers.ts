import "server-only"
import { prisma } from "@/lib/db"
import {
  PROVIDERS,
  isProviderConfigured,
  missingProviderEnv,
  type Provider,
} from "@/lib/providers"

export type { Provider }

/*
 * Estado de los medios de pago = interruptor del admin (`PaymentProviderSetting`)
 * + variables de entorno. Las dos cosas hacen falta: el admin puede apagar un
 * proveedor, pero no encender uno sin credenciales (el checkout fallaría al
 * cobrar).
 *
 * El interruptor SOLO cierra compras nuevas. Quien ya tiene una suscripción viva
 * en ese proveedor conserva su portal y sus upgrades: si no, apagar un medio de
 * pago dejaría a los que ya pagan sin forma de cambiar de plan ni de
 * cancelarse. Por eso `portal` y `upgrade` no lo miran, solo el entorno.
 */

/** Estado de cada medio de pago, para pintar el panel de admin. */
export type ProviderAvailability = {
  provider: Provider
  /** Credenciales en el entorno: sin esto el checkout no puede completarse. */
  configured: boolean
  /** Interruptor del admin. */
  enabled: boolean
  /** Lo que se le ofrece a un cliente que aún no está suscrito. */
  available: boolean
  /** Variables que faltan, por nombre (nunca su valor). Solo para el admin. */
  missingEnv: string[]
}

/** Estado de cada proveedor, en el orden del registro. */
export async function listProviderAvailability(): Promise<ProviderAvailability[]> {
  const rows = await prisma.paymentProviderSetting.findMany({
    select: { provider: true, enabled: true },
  })
  const toggles = new Map(rows.map((row) => [row.provider, row.enabled]))
  return PROVIDERS.map((provider) => {
    const configured = isProviderConfigured(provider)
    // Sin fila = habilitado: el interruptor solo aparece en BD cuando el admin
    // lo toca, así que su ausencia significa "no lo ha tocado".
    const enabled = toggles.get(provider) ?? true
    return {
      provider,
      configured,
      enabled,
      available: configured && enabled,
      missingEnv: configured ? [] : missingProviderEnv(provider),
    }
  })
}

/** Proveedores con los que se puede abrir un checkout nuevo. */
export async function getAvailableProviders(): Promise<Provider[]> {
  const all = await listProviderAvailability()
  return all.filter((row) => row.available).map((row) => row.provider)
}

/** Apaga/enciende el interruptor de un proveedor (crea la fila si no existe). */
export async function setProviderEnabled(
  provider: Provider,
  enabled: boolean,
): Promise<{ provider: Provider; enabled: boolean }> {
  const row = await prisma.paymentProviderSetting.upsert({
    where: { provider },
    create: { provider, enabled },
    update: { enabled },
    select: { provider: true, enabled: true },
  })
  return row
}
