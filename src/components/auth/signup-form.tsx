"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { AtSign, KeyRound, Tag, Eye, EyeOff, ArrowRight } from "lucide-react"
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
  const [showPassword, setShowPassword] = useState(false)

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
    <div className="auth-form">
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}

      {showGoogle ? (
        <>
          <div className="auth-social">
            <GoogleButton callbackUrl={callbackUrl} />
          </div>
          <div className="auth-card__divider">
            <span className="auth-card__divider-text">{dict.orWithEmail}</span>
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field">
          <div className="auth-field__head">
            <label htmlFor="name" className="auth-field__label">
              {dict.collectorName}
            </label>
            <span className="auth-field__hint auth-field__hint--secondary">
              {dict.collectorPublic}
            </span>
          </div>
          <div className="auth-field__control">
            <Tag className="auth-field__icon" aria-hidden="true" />
            <input
              id="name"
              name="name"
              type="text"
              maxLength={80}
              autoComplete="name"
              className="auth-field__input"
              placeholder="Ej: CyberGamer_99"
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="email" className="auth-field__label">
            {dict.email}
          </label>
          <div className="auth-field__control">
            <AtSign className="auth-field__icon" aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className="auth-field__input"
              placeholder="tu@identidad.vault"
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="password" className="auth-field__label">
            {dict.vaultPassword}
          </label>
          <div className="auth-field__control">
            <KeyRound className="auth-field__icon" aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
              className="auth-field__input auth-field__input--with-action"
              placeholder="••••••••••••"
            />
            <button
              type="button"
              className="auth-field__action"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? dict.hidePassword : dict.showPassword}
            >
              {showPassword ? (
                <EyeOff className="auth-field__action-icon" aria-hidden="true" />
              ) : (
                <Eye className="auth-field__action-icon" aria-hidden="true" />
              )}
            </button>
          </div>
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

        <div className="auth-meta">
          <label className="auth-meta__remember" htmlFor="terms">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="auth-meta__checkbox"
            />
            <span className="auth-meta__remember-text">{dict.acceptTerms}</span>
          </label>
          <span className="auth-meta__encryption">
            <span className="auth-meta__encryption-dot" aria-hidden="true" />
            {dict.encryption}
          </span>
        </div>

        <button type="submit" className="auth-submit" disabled={pending}>
          <span>{pending ? dict.loading : dict.submitSignupCta}</span>
          <ArrowRight className="auth-submit__icon" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
