"use client"

import { usePathname, useRouter } from "next/navigation"
import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Locale } from "@/lib/i18n/locales"
import { locales } from "@/lib/i18n/locales"

export function LocaleSwitcher({
  currentLocale,
  label,
}: {
  currentLocale: Locale
  label: string
}) {
  const pathname = usePathname()
  const router = useRouter()

  const target = locales.find((locale) => locale !== currentLocale)

  function switchLocale() {
    if (!target) return
    const currentPrefix = `/${currentLocale}`
    const path =
      pathname === currentPrefix
        ? `/${target}`
        : pathname.replace(currentPrefix, `/${target}`)
    router.replace(path)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      aria-label={label}
    >
      <Languages className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}