import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { lang } from "next/root-params"
import { LoginForm } from "@/components/auth/login-form"
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
      : `/${isLocale(currentLocale) ? currentLocale : "es"}/app`

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-24 sm:px-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{dict.auth.loginTitle}</CardTitle>
          <CardDescription>{dict.auth.loginDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            dict={dict.auth}
            locale={isLocale(currentLocale) ? currentLocale : "es"}
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
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.noAccount}{" "}
        <Link
          href={`/${isLocale(currentLocale) ? currentLocale : "es"}/signup`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {dict.auth.createAccount}
        </Link>
      </p>
    </div>
  )
}