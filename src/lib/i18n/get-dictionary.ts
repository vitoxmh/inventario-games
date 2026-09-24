import "server-only"
import { lang } from "next/root-params"
import { notFound } from "next/navigation"
import { es, type Dictionary } from "@/messages/es"
import { en } from "@/messages/en"
import { isLocale, type Locale } from "@/lib/i18n/locales"

const dictionaries: Record<Locale, Dictionary> = { es, en }

export async function getDictionary(): Promise<Dictionary> {
  const locale = await lang()
  if (!isLocale(locale)) notFound()
  return dictionaries[locale]
}

export type { Dictionary }
export { isLocale }