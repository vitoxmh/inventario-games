import "server-only"
import { lang } from "next/root-params"
import { notFound } from "next/navigation"
import { es, type Dictionary } from "@/messages/es"
import { en } from "@/messages/en"
import { isLocale, type Locale } from "@/lib/i18n/locales"

const dictionaries: Record<Locale, Dictionary> = { es, en }

/*
 * Variante con el locale explícito: `lang()` (next/root-params) no está
 * soportado dentro de Route Handlers, así que las rutas que reciben el locale
 * por params (p. ej. opengraph-image) usan esta en lugar de getDictionary().
 */
export async function getDictionaryFor(locale: string): Promise<Dictionary> {
  if (!isLocale(locale)) notFound()
  return dictionaries[locale]
}

export async function getDictionary(): Promise<Dictionary> {
  const locale = await lang()
  if (!isLocale(locale)) notFound()
  return dictionaries[locale]
}

export type { Dictionary }
export { isLocale }