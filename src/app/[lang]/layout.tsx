import type { Metadata } from "next"
import { Inter, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google"
import { lang } from "next/root-params"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/sonner"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale, locales } from "@/lib/i18n/locales"
import { OG_LOCALE, siteUrl } from "@/lib/seo"
import "../globals.scss"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

/*
 * Metadata por locale: la marca y la descripción salen del diccionario, no de
 * literales en inglés (la web por defecto es `es`). El `title.template` solo se
 * aplica a las páginas que fijan su propio title; las públicas que ya incluyen
 * la marca en el texto usan `absolute`.
 *
 * `canonical` y `hreflang` NO se declaran aquí a propósito: se heredan tal cual
 * a /login, /signup o /app, donde serían enlaces canónicos falsos. Solo las
 * páginas públicas los declaran con buildAlternates().
 */
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  const brand = dict.site.name

  return {
    metadataBase: siteUrl(),
    applicationName: brand,
    title: {
      default: dict.seo.homeTitle,
      template: `%s · ${brand}`,
    },
    description: dict.seo.homeDescription,
    openGraph: {
      type: "website",
      siteName: brand,
      locale: OG_LOCALE[locale],
      url: `/${locale}`,
      title: dict.seo.homeTitle,
      description: dict.seo.homeDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: dict.seo.homeTitle,
      description: dict.seo.homeDescription,
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
  }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function RootLayout({
  children,
}: LayoutProps<"/[lang]">) {
  const currentLocale = await lang()

  return (
    <html
      lang={currentLocale}
      className={`${inter.variable} ${jakarta.variable} ${geistMono.variable}`}
      // El reset aplica `scroll-behavior: smooth` al `html` (ver `_base.scss`).
      // Next necesita este atributo para que su propio scroll a la cima tras
      // navegar no pelee con esa transición suave; sin él avisa por consola.
      data-scroll-behavior="smooth"
    >
      <body>
        <SessionProvider>{children}</SessionProvider>
        <Toaster />
      </body>
    </html>
  )
}