import type { MetadataRoute } from "next"
import { locales } from "@/lib/i18n/locales"
import { absoluteUrl } from "@/lib/seo"

/*
 * Solo se listan las rutas públicas reales. Las de /app y /admin requieren
 * sesión (el proxy devuelve 307 a /login) y además declaran noindex, así que
 * no aporta nada ofrecer URLs que solo redirigen.
 */
const PATHS = ["", "/pricing"] as const

export const dynamic = "force-dynamic"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return locales.flatMap((locale) =>
    PATHS.map((path) => ({
      url: absoluteUrl(`/${locale}${path}`),
      lastModified,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, absoluteUrl(`/${l}${path}`)]),
        ),
      },
    })),
  )
}
