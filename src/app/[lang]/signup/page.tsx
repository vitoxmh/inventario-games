import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { lang } from "next/root-params"
import { SignupForm } from "@/components/auth/signup-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return {
    title: dict.auth.signupTitle,
    // Fuera del índice, pero se sigue el enlace: es la landing de conversión.
    robots: { index: false, follow: true },
  }
}

export const dynamic = "force-dynamic"

export default async function SignupPage(
  props: PageProps<"/[lang]/signup">,
) {
  void props
  const dict = await getDictionary()
  const currentLocale = await lang()
  // El proxy inyecta x-nonce por petición: <Script> de Turnstile lo necesita
  // para pasar la CSP estricta (script-src 'nonce-...' 'strict-dynamic').
  const nonce = (await headers()).get("x-nonce") ?? undefined

  const locale = isLocale(currentLocale) ? currentLocale : "es"

  return (
    <div className="auth-page">
      <Card>
        <CardHeader className="notice--center">
          <CardTitle className="u-balance">{dict.auth.signupTitle}</CardTitle>
          <CardDescription>{dict.auth.signupDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm
            dict={dict.auth}
            locale={locale}
            callbackUrl={`/${locale}/app`}
            showGoogle={Boolean(
              process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
            )}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            nonce={nonce}
          />
        </CardContent>
      </Card>
      <p className="auth-form__aside">
        {dict.auth.hasAccount}{" "}
        <Link
          href={`/${locale}/login`}
          className="auth-form__link auth-form__link-strong"
        >
          {dict.auth.loginLink}
        </Link>
      </p>
    </div>
  )
}