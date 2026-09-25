import { defaultLocale, locales, type Locale } from "@/lib/i18n/locales"

/*
 * SITE_URL es la única fuente de verdad para las URLs absolutas que emitimos
 * (canonical, openGraph.url, sitemap, robots, JSON-LD). Sin ella el fallback es
 * localhost, y en producción eso significa canonicals y OG apuntando a otra
 * máquina: el peor error de SEO posible porque Google indexa la URL equivocada.
 * NEXT_PUBLIC_APP_URL (la que usa Stripe) se acepta como alias para no
 * obligar a mantener dos variables distintas.
 */
export function siteUrl(): URL {
  const raw = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  try {
    return new URL(raw ?? "http://localhost:3000")
  } catch {
    return new URL("http://localhost:3000")
  }
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl()).toString()
}

/** Open Graph usa códigos de idioma con país (es_ES), no el locale corto. */
export const OG_LOCALE: Record<Locale, string> = {
  es: "es_ES",
  en: "en_US",
}

/**
 * Canonical + hreflang de la misma ruta en todos los idiomas. `x-default`
 * apunta al locale por defecto para los buscadores que no aceptan el
 * `Accept-Language` del usuario.
 */
export function buildAlternates(locale: Locale, path = "") {
  return {
    canonical: `/${locale}${path}`,
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, `/${l}${path}`])),
      "x-default": `/${defaultLocale}${path}`,
    },
  }
}

/**
 * JSON.stringify no escapa `<`, así que un `</script>` dentro de cualquier dato
 * (p. ej. el nombre de un plan, editable por un admin) cerraría el script y
 * permitiría inyectar marcado. Escapamos `<`, `>` y `&` como \uXXXX, que es la
 * forma canónica de incrustar JSON-LD sin riesgo.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}
