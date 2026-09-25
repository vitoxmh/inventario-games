import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/seo"

/*
 * Rutas públicas indexables. El prefijo de idioma es obligatorio: el proxy
 * redirige cualquier otra ruta a /{locale} con un 307, y Google no indexa la
 * variante de redirección.
 */
const DISALLOW = [
  "/api/",
  "/app/",
  "/admin/",
  "/login",
  "/signup",
  "/suspended",
]

// Se calcula en cada request (no estático) para que la URL del sitemap sea la
// de SITE_URL en runtime y no la congelada en el build.
export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  }
}
