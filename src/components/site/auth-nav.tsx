"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { LogOut, Gamepad2, User, CreditCard, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import type { Locale } from "@/lib/i18n/locales"

type Labels = {
  login: string
  signup: string
  dashboard: string
  account: string
  billing: string
  admin: string
  logout: string
}

export function AuthNav({ locale, labels }: { locale: Locale; labels: Labels }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status === "loading") {
    return <Skeleton className="skeleton--circle" />
  }

  if (!session) {
    return (
      <div className="u-cluster u-cluster--tight">
        <Link
          href={`/${locale}/login`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "u-hide-sm",
          )}
        >
          {labels.login}
        </Link>
        <Link href={`/${locale}/signup`} className={buttonVariants()}>
          {labels.signup}
        </Link>
      </div>
    )
  }

  const initial = (session.user.name ?? session.user.email ?? "U")
    .charAt(0)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="user-menu__trigger">
        <Avatar>
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="user-menu__content">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="user-menu__label">
              <div className="user-menu__name">
                {session.user.name ?? session.user.email}
              </div>
              <div className="user-menu__email">{session.user.email}</div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/${locale}/app`)}>
          <Gamepad2 aria-hidden="true" />
          {labels.dashboard}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/${locale}/app/account`)}>
          <User aria-hidden="true" />
          {labels.account}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/${locale}/app/billing`)}>
          <CreditCard aria-hidden="true" />
          {labels.billing}
        </DropdownMenuItem>
        {session.user.role === "admin" && (
          <DropdownMenuItem
            onClick={() => router.push(`/${locale}/admin/users`)}
          >
            <Shield aria-hidden="true" />
            {labels.admin}
          </DropdownMenuItem>
        )}
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
