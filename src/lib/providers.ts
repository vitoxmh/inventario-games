import "server-only"
import { PaymentProvider } from "@/generated/prisma/enums"

/*
 * Registro de medios de pago: la ÚNICA fuente de verdad de qué proveedores
 * existen y de qué necesitan para poder cobrar.
 *
 * - La lista sale del enum `PaymentProvider` de Prisma, que es el mismo que
 *   valida la tabla `PaymentProviderSetting` en BD: lo que el admin puede
 *   tocar y lo que este módulo acepta son los mismos valores, por construcción.
 * - "Configurado" significa que están las variables de entorno. El interruptor
 *   del admin vive aparte (`src/lib/payment-providers.ts`) porque apagar un
 *   proveedor NO es lo mismo que no tenerlo configurado.
 */

export const PROVIDERS = [PaymentProvider.stripe, PaymentProvider.mp] as const

export type Provider = (typeof PROVIDERS)[number]

/** Allowlist: lo que llega del cliente nunca se castea a `Provider` sin pasar por aquí. */
export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value)
}

/*
 * Variables que cada proveedor necesita. Una entrada es "este nombre exacto" o
 * "al menos uno de estos" (los precios de Stripe/MP vienen por pares: solo
 * hace falta el del plan que se vaya a vender).
 */
type EnvRequirement = string | { anyOf: readonly string[] }

const PROVIDER_ENV: Record<Provider, readonly EnvRequirement[]> = {
  stripe: [
    "STRIPE_SECRET_KEY",
    { anyOf: ["STRIPE_PRICE_PRO", "STRIPE_PRICE_COLLECTOR"] },
  ],
  mp: [
    "MP_ACCESS_TOKEN",
    "MP_CURRENCY_ID",
    { anyOf: ["MP_PRICE_PRO", "MP_PRICE_COLLECTOR"] },
  ],
}

function isEnvSatisfied(requirement: EnvRequirement): boolean {
  if (typeof requirement === "string") {
    return Boolean(process.env[requirement])
  }
  return requirement.anyOf.some((key) => Boolean(process.env[key]))
}

/**
 * Nombres de las variables que FALTAN para que el proveedor funcione. Solo se
 * muestran en el panel de admin (para saber qué añadir en el despliegue); de
 * aquí nunca sale ningún valor, solo el nombre.
 */
export function missingProviderEnv(provider: Provider): string[] {
  const missing: string[] = []
  for (const requirement of PROVIDER_ENV[provider]) {
    if (isEnvSatisfied(requirement)) continue
    if (typeof requirement === "string") {
      missing.push(requirement)
    } else {
      // Grupo "al menos uno": se listan todos los que faltan para que el admin
      // sepa las dos opciones, no solo la primera.
      missing.push(...requirement.anyOf.filter((key) => !process.env[key]))
    }
  }
  return missing
}

/** ¿Está el proveedor con sus credenciales en el entorno? */
export function isProviderConfigured(provider: Provider): boolean {
  return PROVIDER_ENV[provider].every(isEnvSatisfied)
}
