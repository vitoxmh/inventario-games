import Link from "next/link"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { Gamepad2, BarChart3, User, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { auth } from "@/auth"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const dict = await getDictionary()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  const session = await auth()
  if (session?.user?.banned) {
    redirect(`/${locale}/suspended`)
  }

  const links = [
    { href: `/${locale}/app`, label: dict.app.dashboard, icon: Gamepad2 },
    { href: `/${locale}/app/stats`, label: dict.app.stats, icon: BarChart3 },
    { href: `/${locale}/app/account`, label: dict.app.account, icon: User },
    { href: `/${locale}/app/billing`, label: dict.app.billing, icon: CreditCard },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-8">
      <aside className="mb-6 md:sticky md:top-8 md:mb-0">
        <nav
          aria-label={dict.app.navLabel}
          className="flex flex-col items-stretch gap-1"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "inline-flex items-center justify-start gap-2",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}