import Link from "next/link"
import { lang } from "next/root-params"
import { Sparkles, Tags } from "lucide-react"
import { Logo } from "@/components/site/logo"
import { LocaleSwitcher } from "@/components/site/locale-switcher"
import { AuthNav } from "@/components/site/auth-nav"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export async function SiteHeader() {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <Link href={`/${locale}`} className="u-grow">
          <Logo name={dict.site.name} />
        </Link>

        <nav className="site-header__nav">
          <Link href={`/${locale}#features`} className="site-header__link">
            <Sparkles className="site-header__icon" aria-hidden="true" />
            {dict.nav.features}
          </Link>
          <Link href={`/${locale}/pricing`} className="site-header__link">
            <Tags className="site-header__icon" aria-hidden="true" />
            {dict.nav.pricing}
          </Link>
        </nav>

        <div className="site-header__actions">
          <LocaleSwitcher currentLocale={locale} label={dict.locale.switchTo} />
          <ThemeToggle
            labels={{
              toggleLight: dict.nav.toggleLight,
              toggleDark: dict.nav.toggleDark,
            }}
          />
          <AuthNav
            locale={locale}
            labels={{
              login: dict.nav.login,
              signup: dict.nav.signup,
              dashboard: dict.app.dashboard,
              account: dict.app.account,
              billing: dict.app.billing,
              admin: dict.admin.title,
              logout: dict.app.logout,
            }}
          />
        </div>
      </div>
    </header>
  )
}
