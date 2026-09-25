"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/site/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle({
  labels,
}: {
  labels: { toggleLight: string; toggleDark: string }
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      suppressHydrationWarning
      aria-label={isDark ? labels.toggleDark : labels.toggleLight}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="size-4 hidden dark:block" aria-hidden="true" />
    </Button>
  )
}