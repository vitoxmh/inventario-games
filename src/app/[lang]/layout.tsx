import type { Metadata } from "next"
import { headers } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import { lang } from "next/root-params"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/site/theme-provider"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { Toaster } from "@/components/ui/sonner"
import { locales } from "@/lib/i18n/locales"
import "../globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "GameVault",
    template: "%s · GameVault",
  },
  description:
    "The definitive inventory SaaS for video game collectors. Organize, value and sync your collection in the cloud.",
  openGraph: {
    type: "website",
    siteName: "GameVault",
    title: "GameVault",
    description:
      "The definitive inventory SaaS for video game collectors. Organize, value and sync your collection in the cloud.",
    url: "/",
  },
  twitter: {
    card: "summary",
    site: "@gamevault",
    title: "GameVault",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    languages: {
      es: "/es",
      en: "/en",
    },
  },
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