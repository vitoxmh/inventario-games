"use client"

import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { LogOut, User, CreditCard, ShieldCheck } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Locale } from "@/lib/i18n/locales"

type Labels = {
  account: string
  billing: string
  admin: string
  logout: string
}

/**
 * Bloque de usuario de la barra superior de QuestVault: avatar, nombre, rol y
 * el menú con las acciones de cuenta. Es un Client Component porque el menú,
 * el cambio de idioma y el cierre de sesión son interacciones del navegador.
 */
export function ShellUserMenu({
  name,
  email,
  role,
  isAdmin,
  locale,
  labels,
}: {
  name: string
  email: string
  role: string
  isAdmin: boolean
  locale: Locale
  labels: Labels
}) {
  const router = useRouter()
  const initial = (name || email || "U").charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="topbar__user">
        <Avatar className="topbar__avatar">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <span className="topbar__user-meta">
          <span className="topbar__user-name">{name}</span>
          <span className="topbar__user-role">{role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="user-menu__content">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="user-menu__label">
              <div className="user-menu__name">{name}</div>
              <div className="user-menu__email">{email}</div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/${locale}/app/account`)}>
          <User aria-hidden="true" />
          {labels.account}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/${locale}/app/billing`)}>
          <CreditCard aria-hidden="true" />
          {labels.billing}
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem onClick={() => router.push(`/${locale}/admin/users`)}>
            <ShieldCheck aria-hidden="true" />
            {labels.admin}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          render={<button type="button" />}
          onClick={() => signOut({ callbackUrl: `/${locale}` })}
        >
          <LogOut aria-hidden="true" />
          {labels.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
