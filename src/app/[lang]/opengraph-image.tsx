import { ImageResponse } from "next/og"
import { getDictionaryFor } from "@/lib/i18n/get-dictionary"
import { siteUrl } from "@/lib/seo"

export const alt = "VMVault"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/*
 * Imagen social generada en el edge. Next la reutiliza como twitter:image
 * cuando no hay twitter-image definida, y el layout declara
 * twitter.card = "summary_large_image". Los textos salen del diccionario, así
 * que la tarjeta sale en el idioma de la URL.
 *
 * OJO: aquí NO se puede usar getDictionary() (que llama a lang() de
 * next/root-params): dentro de un Route Handler esa API no está soportada y
 * revienta con 500. El locale llega por params.
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const dict = await getDictionaryFor(lang)
  const host = siteUrl().host

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0b0f19 0%, #141a2e 55%, #1d2542 100%)",
          padding: "72px",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              background: "#6366f1",
              fontSize: "40px",
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ fontSize: "40px", fontWeight: 700 }}>{dict.site.name}</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxWidth: "980px",
          }}
        >
          <div style={{ fontSize: "68px", lineHeight: 1.1, fontWeight: 700 }}>
            {dict.hero.title}
          </div>
          <div style={{ fontSize: "30px", color: "#a5b0c9", lineHeight: 1.35 }}>
            {dict.site.tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "26px",
            color: "#c7d0e3",
          }}
        >
          <div>{dict.features.intro}</div>
          <div style={{ display: "flex" }}>{host}</div>
        </div>
      </div>
    ),
    size,
  )
}
