"use client"

import Link from "next/link"
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

  if (status === "loading") {
    return <Skeleton className="h-8 w-24" />
  }

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={`/${locale}/login`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "hidden sm:inline-flex",
          )}
        >
          {labels.login}
        </Link>
        <Link
          href={`/${locale}/signup`}
          className={buttonVariants({ size: "default" })}
        >
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
      <DropdownMenuTrigger className="outline-none">
        <Avatar className="size-8 border">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate text-sm font-medium">
              {session.user.name ?? session.user.email}
            </div>
            <div className="truncate text-xs font-normal text-muted-foreground">
              {session.user.email}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`/${locale}/app`} />}>
          <Gamepad2 aria-hidden="true" />
          {labels.dashboard}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/${locale}/app/account`} />}>
          <User aria-hidden="true" />
          {labels.account}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/${locale}/app/billing`} />}>
          <CreditCard aria-hidden="true" />
          {labels.billing}
        </DropdownMenuItem>
        {session.user.role === "admin" && (
          <DropdownMenuItem render={<Link href={`/${locale}/admin/users`} />}>
            <Shield aria-hidden="true" />
            {labels.admin}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="w-full"
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