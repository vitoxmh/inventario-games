"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GoogleButton } from "@/components/auth/login-form"
import { Turnstile } from "@/components/auth/turnstile"
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"

type AuthDict = Dictionary["auth"]

export function SignupForm({
  dict,
  locale,
  callbackUrl,
  showGoogle = false,
  turnstileSiteKey,
  nonce,
}: {
  dict: AuthDict
  locale: Locale
  callbackUrl: string
  showGoogle?: boolean
  /** Sin site key no se pinta el widget y el registro va sin captcha. */
  turnstileSiteKey?: string
  /** Nonce de la CSP para el <Script> de Turnstile (lo inyecta src/proxy.ts). */
  nonce?: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [captchaToken, setCaptchaToken] = useState("")
  const [captchaReset, setCaptchaReset] = useState(0)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(dict.invalidEmail)
      return
    }
    if (password.length < 8) {
      setError(dict.passwordShort)
      return
    }
    if (turnstileSiteKey && !captchaToken) {
      setError(dict.captchaFailed)
      return
    }

    startTransition(async () => {
      const res = await fetch(`/api/auth/register?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          captchaToken: captchaToken || undefined,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        // El token es de un solo uso: aunque el servidor lo consumiera, el
        // siguiente intento necesita uno nuevo.
        setCaptchaToken("")
        setCaptchaReset((value) => value + 1)
        const map: Record<string, string> = {
          email_in_use: dict.emailInUse,
          password_short: dict.passwordShort,
          invalid_email: dict.invalidEmail,
          captcha_failed: dict.captchaFailed,
        }
        setError(map[data?.error] ?? dict.genericError)
        return
      }

      if (data?.verified) {
        // El registro ya pasó el captcha: `signupTicket` exime del reto del
        // login para no pedirlo otra vez en este mismo flujo.
        const result = await signIn("credentials", {
          email,
          password,
          signupTicket: data.signupTicket,
          redirect: false,
        })
        if (result?.error) {
          router.push(`/${locale}/login?registered=1`)
          return
        }
        router.push(callbackUrl)
        router.refresh()
        return
      }

      router.push(`/${locale}/login?registered=1`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{dict.name}</Label>
          <Input
            id="name"
            name="name"
            type="text"
            maxLength={80}
            autoComplete="name"
            placeholder={dict.namePlaceholder}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{dict.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{dict.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
          />
        </div>
        {turnstileSiteKey && (
          <Turnstile
            siteKey={turnstileSiteKey}
            action="signup"
            nonce={nonce}
            onToken={setCaptchaToken}
            onUnavailable={() => {
              setCaptchaToken("")
              setError(dict.captchaFailed)
            }}
            resetSignal={captchaReset}
          />
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? dict.loading : dict.submitSignup}
        </Button>
      </form>

      <GoogleButton dict={dict} callbackUrl={callbackUrl} showGoogle={showGoogle} />
    </div>
  )
}
