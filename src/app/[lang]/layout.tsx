import type { Metadata } from "next"
import { headers } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import { lang } from "next/root-params"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/site/theme-provider"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { Toaster } from "@/components/ui/sonner"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale, locales } from "@/lib/i18n/locales"
import { OG_LOCALE, siteUrl } from "@/lib/seo"
import "../globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  // El proxy inyecta x-nonce por petición; se lo pasamos al script anti-FOUC
  // del ThemeProvider propio (src/components/site/theme-provider.tsx) para que
  // la CSP estricta (nonce + strict-dynamic) lo admita.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang={currentLocale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider nonce={nonce}>
          <SessionProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
            <Toaster />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}