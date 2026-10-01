"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Gamepad2,
  BarChart3,
  CreditCard,
  User,
  ShieldCheck,
  Users,
  Boxes,
  Wallet,
  LayoutGrid,
  Settings,
  Shapes,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Locale } from "@/lib/i18n/locales"

type NavLabels = {
  collection: string
  admin: string
  dashboard: string
  stats: string
  billing: string
  account: string
  users: string
  games: string
  subscriptions: string
  platforms: string
  genres: string
  plans: string
  payments: string
}

type NavLink = {
  href: string
  label: string
  Icon: typeof Gamepad2
}

/**
 * Navegación del sidebar de QuestVault.
 *
 * El enlace activo se resuelve en cliente con `usePathname` en lugar de pasar
 * la ruta como prop desde el layout: el layout es un Server Component y no
 * conoce el segmento de la URL que se está renderizando.
 */
export function ShellSidebarNav({
  locale,
  isAdmin,
  labels,
}: {
  locale: Locale
  isAdmin: boolean
  labels: NavLabels
}) {
  const pathname = usePathname()

  const collection: NavLink[] = [
    { href: `/${locale}/app`, label: labels.dashboard, Icon: Gamepad2 },
    { href: `/${locale}/app/stats`, label: labels.stats, Icon: BarChart3 },
    { href: `/${locale}/app/billing`, label: labels.billing, Icon: CreditCard },
    { href: `/${locale}/app/account`, label: labels.account, Icon: User },
  ]

  const admin: NavLink[] = [
    { href: `/${locale}/admin/users`, label: labels.users, Icon: Users },
    { href: `/${locale}/admin/games`, label: labels.games, Icon: Boxes },
    {
      href: `/${locale}/admin/subscriptions`,
      label: labels.subscriptions,
      Icon: ShieldCheck,
    },
    {
      href: `/${locale}/admin/platforms`,
      label: labels.platforms,
      Icon: LayoutGrid,
    },
    {
      href: `/${locale}/admin/genres`,
      label: labels.genres,
      Icon: Shapes,
    },
    { href: `/${locale}/admin/plans`, label: labels.plans, Icon: Settings },
    { href: `/${locale}/admin/payments`, label: labels.payments, Icon: Wallet },
  ]

  // `/es/app` es prefijo de `/es/app/stats`, así que la raíz del inventario solo
  // se marca activa en coincidencia exacta.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  const renderSection = (title: string, links: NavLink[]) => (
    <div className="shell-nav__group">
      <div className="shell-nav__group-label">
        <p className="shell-nav__group-title">{title}</p>
      </div>
      <nav className="shell-nav__list">
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "shell-nav__link",
              isActive(href) && "shell-nav__link--active",
            )}
          >
            <Icon className="shell-nav__icon" aria-hidden="true" />
            <span className="shell-nav__label">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )

  return (
    <>
      {renderSection(labels.collection, collection)}
      {isAdmin ? renderSection(labels.admin, admin) : null}
    </>
  )
}
