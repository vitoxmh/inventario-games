import type { Metadata } from "next"
import { headers } from "next/headers"
import { lang } from "next/root-params"
import { AuthCard } from "@/components/auth/auth-card"
import { LoginForm } from "@/components/auth/login-form"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return {
    title: dict.auth.loginTitle,
    // Página de acceso: fuera del índice, pero se siguen sus enlaces (el CTA de
    // registro de la LP y del footer).
    robots: { index: false, follow: true },
  }
}

export const dynamic = "force-dynamic"

export default async function LoginPage(
  props: PageProps<"/[lang]/login">,
) {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  // El proxy inyecta x-nonce por petición: <Script> de Turnstile lo necesita
  // para pasar la CSP estricta (script-src 'nonce-...' 'strict-dynamic').
  const nonce = (await headers()).get("x-nonce") ?? undefined

  const searchParams = await props.searchParams
  const rawCallback = Array.isArray(searchParams?.callbackUrl)
    ? searchParams.callbackUrl[0]
    : searchParams?.callbackUrl

  const callbackUrl =
    typeof rawCallback === "string" &&
    rawCallback.startsWith("/") &&
    !rawCallback.startsWith("//")
      ? rawCallback
      : `/${locale}/app`

  return (
    <div className="auth-page">
      <div className="auth-page__inner">
        <AuthCard dict={dict.auth} locale={locale} mode="login">
          <LoginForm
            dict={dict.auth}
            locale={locale}
            callbackUrl={callbackUrl}
            verified={searchParams?.verified === "1"}
            invalidToken={searchParams?.error === "invalid_token"}
            registered={searchParams?.registered === "1"}
            showGoogle={Boolean(
              process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
            )}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            nonce={nonce}
          />
        </AuthCard>
      </div>
    </div>
  )
}