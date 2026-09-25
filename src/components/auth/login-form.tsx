"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/auth/turnstile"
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"

type AuthDict = Dictionary["auth"]

export function LoginForm({
  dict,
  locale,
  callbackUrl,
  verified,
  invalidToken,
  registered,
  showGoogle = false,
  turnstileSiteKey,
  nonce,
}: {
  dict: AuthDict
  locale: Locale
  callbackUrl: string
  verified: boolean
  invalidToken: boolean
  registered: boolean
  showGoogle?: boolean
  /** Sin site key no se pinta el widget y el login va sin captcha. */
  turnstileSiteKey?: string
  /** Nonce de la CSP para el <Script> de Turnstile (lo inyecta src/proxy.ts). */
  nonce?: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [resendNotice, setResendNotice] = useState(false)
  const [pending, startTransition] = useTransition()
  const [captchaToken, setCaptchaToken] = useState("")
  const [captchaReset, setCaptchaReset] = useState(0)

  // El token de Turnstile es de un solo uso: en cuanto se manda hay que
  // resetear el widget para el siguiente intento.
  function consumeCaptcha() {
    setCaptchaToken("")
    setCaptchaReset((value) => value + 1)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(dict.invalidEmail)
      return
    }
    if (!email || !password) {
      setError(dict.errorWrong)
      return
    }
    if (turnstileSiteKey && !captchaToken) {
      setError(dict.captchaFailed)
      return
    }

    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        captchaToken: captchaToken || undefined,
        redirect: false,
      })
      if (result?.error) {
        // No se distingue "captcha falló" de "credenciales incorrectas": el
        // servidor devuelve el mismo error en ambos casos a propósito.
        consumeCaptcha()
        setError(dict.errorWrong)
        return
      }
      router.push(callbackUrl)
      router.refresh()
    })
  }

  function handleResend() {
    const emailInput = document.getElementById(
      "email",
    ) as HTMLInputElement | null
    const email = emailInput?.value.trim() ?? ""
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(dict.invalidEmail)
      return
    }
    if (turnstileSiteKey && !captchaToken) {
      setError(dict.captchaFailed)
      return
    }
    setError(null)
    setResendNotice(false)
    startTransition(async () => {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          locale,
          captchaToken: captchaToken || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      consumeCaptcha()
      if (!res.ok) {
        setError(
          data?.error === "captcha_failed" ? dict.captchaFailed : dict.genericError,
        )
        return
      }
      setResendNotice(true)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      {verified && <Alert tone="success">{dict.verified}</Alert>}
      {invalidToken && <Alert tone="error">{dict.errorInvalidToken}</Alert>}
      {registered && <Alert tone="success">{dict.registered}</Alert>}
      {resendNotice && <Alert tone="success">{dict.resendSent}</Alert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            maxLength={200}
            autoComplete="current-password"
          />
        </div>
        {turnstileSiteKey && (
          <Turnstile
            siteKey={turnstileSiteKey}
            action="login"
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
          {pending ? dict.loading : dict.submitLogin}
        </Button>
      </form>

      {registered && (
        <button
          type="button"
          onClick={handleResend}
          disabled={pending}
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {dict.resend} {dict.resendAction}
        </button>
      )}

      <GoogleButton dict={dict} callbackUrl={callbackUrl} showGoogle={showGoogle} />
    </div>
  )
}

export function GoogleButton({
  dict,
  callbackUrl,
  showGoogle,
}: {
  dict: AuthDict
  callbackUrl: string
  showGoogle: boolean
}) {
  const [pending, startTransition] = useTransition()

  if (!showGoogle) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {dict.or}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void signIn("google", { redirectTo: callbackUrl })
          })
        }
      >
        <GoogleIcon />
        {dict.continueGoogle}
      </Button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.76-2.11-6.7-4.94H1.26v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6v-3.1H1.26a12 12 0 0 0 0 10.8L5.3 14.3Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.98 11.98 0 0 0 1.26 6.6l4.04 3.1C6.24 6.87 8.88 4.76 12 4.76Z"
      />
    </svg>
  )
}

function Alert({
  tone,
  children,
}: {
  tone: "error" | "success"
  children: React.ReactNode
}) {
  const styles =
    tone === "error"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${styles}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  )
}