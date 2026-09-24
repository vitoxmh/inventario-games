import Link from "next/link"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { Users, Gamepad2, CreditCard, LayoutGrid, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { requireAdmin } from "@/lib/guard"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const guard = await requireAdmin()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"
  const dict = await getDictionary()

  if (!guard.authorized) {
    redirect(`/${locale}/app`)
  }

  const links = [
    { href: `/${locale}/admin/users`, label: dict.admin.users, icon: Users },
    { href: `/${locale}/admin/games`, label: dict.admin.games, icon: Gamepad2 },
    {
      href: `/${locale}/admin/subscriptions`,
      label: dict.admin.subscriptions,
      icon: CreditCard,
    },
    {
      href: `/${locale}/admin/platforms`,
      label: dict.admin.platforms,
      icon: LayoutGrid,
    },
    {
      href: `/${locale}/admin/plans`,
      label: dict.admin.plans,
      icon: Settings,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <nav className="mb-8 flex flex-wrap gap-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex items-center gap-1.5",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}