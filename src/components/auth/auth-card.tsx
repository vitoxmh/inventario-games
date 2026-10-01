import Link from "next/link"
import { LogIn, UserPlus, ShieldCheck } from "lucide-react"
import { VaultMark } from "@/components/site/vault-mark"
import { cn } from "@/lib/utils"
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"

type AuthDict = Dictionary["auth"]

/**
 * Tarjeta de acceso de QuestVault.
 *
 * El diseño muestra acceso y registro en una sola tarjeta con dos pestañas. En
 * esta aplicación son dos rutas distintas (`/login` y `/signup`) porque el
 * flujo de verificación por correo y el `callbackUrl` dependen de la URL, así
 * que las pestañas navegan en lugar de conmutar en el cliente.
 *
 * Encabezado, pestañas y pie legal son comunes; el formulario lo inyecta cada
 * página como `children`.
 */
export function AuthCard({
  dict,
  locale,
  mode,
  children,
}: {
  dict: AuthDict
  locale: Locale
  mode: "login" | "signup"
  children: React.ReactNode
}) {
  const isLogin = mode === "login"

  const tabs = [
    {
      key: "login" as const,
      href: `/${locale}/login`,
      label: dict.tabLogin,
      Icon: LogIn,
    },
    {
      key: "signup" as const,
      href: `/${locale}/signup`,
      label: dict.tabSignup,
      Icon: UserPlus,
    },
  ]

  return (
    <div className="auth-card">
      <div className="auth-card__hero">
        <span className="auth-card__blob auth-card__blob--primary" aria-hidden="true" />
        <span className="auth-card__blob auth-card__blob--secondary" aria-hidden="true" />

        <div className="auth-card__mark">
          <VaultMark className="auth-card__mark-svg" />
        </div>

        <div className="auth-card__wordmark">
          <span className="auth-card__brand">
            <span className="auth-card__brand-strong">QUEST</span>
            <span className="auth-card__brand-accent">VAULT</span>
          </span>
          <span className="auth-card__badge">{dict.vaultBadge}</span>
        </div>

        <p className="auth-card__tagline">{dict.vaultTagline}</p>

        <div className="auth-card__strip">
          <div className="auth-card__strip-body">
            <div className="auth-card__strip-left">
              <span className="auth-card__strip-dot" aria-hidden="true" />
              <span className="auth-card__strip-label">{dict.vaultSynced}</span>
            </div>
            <div className="auth-card__strip-right">
              <ShieldCheck className="auth-card__strip-icon" aria-hidden="true" />
              <span>{dict.vaultSecure}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-card__body">
        <div className="auth-card__tabs" role="tablist">
          {tabs.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              role="tab"
              aria-selected={key === mode}
              className={cn(
                "auth-card__tab",
                key === mode && "auth-card__tab--active",
              )}
            >
              <Icon
                className={cn(
                  "auth-card__tab-icon",
                  key === mode && "auth-card__tab-icon--active",
                )}
                aria-hidden="true"
              />
              {label}
            </Link>
          ))}
        </div>

        {children}

        <div className="auth-card__footer">
          <p className="auth-card__footer-text">
            {isLogin ? dict.firstTime : dict.alreadyHaveVault}{" "}
            <Link
              href={isLogin ? `/${locale}/signup` : `/${locale}/login`}
              className="auth-card__footer-link"
            >
              {isLogin ? dict.createFreeAccount : dict.tabLogin}
            </Link>
          </p>
          <div className="auth-card__legal">
            {/* El diseño los muestra como enlaces, pero la aplicación no tiene
                páginas /terms, /privacy ni /support: crearlas enrutadas aquí
                solo produciría 404. Se pintan como texto y pasan a <Link> cuando
                existan. */}
            <span className="auth-card__legal-link">{dict.terms}</span>
            <span aria-hidden="true">•</span>
            <span className="auth-card__legal-link">{dict.privacy}</span>
            <span aria-hidden="true">•</span>
            <span className="auth-card__legal-link">{dict.support}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
