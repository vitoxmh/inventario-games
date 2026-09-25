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
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={`/${locale}`} className="shrink-0">
          <Logo name={dict.site.name} />
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <Link
            href={`/${locale}#features`}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {dict.nav.features}
          </Link>
          <Link
            href={`/${locale}/pricing`}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Tags className="size-4" aria-hidden="true" />
            {dict.nav.pricing}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
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