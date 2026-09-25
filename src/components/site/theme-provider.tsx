"use client"

import * as React from "react"
import { useServerInsertedHTML } from "next/navigation"

export type Theme = "light" | "dark" | "system"

const THEMES: Theme[] = ["light", "dark", "system"]
const STORAGE_KEY = "theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"
// Clase global temporal que suspende las transiciones mientras se cambia el
// tema (ver globals.css: `.no-transition * { transition: none !important }`).
const NO_TRANSITION_CLASS = "gv-no-transition"

type ResolvedTheme = "light" | "dark"

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
})

const STORAGE_ERROR_WARNING =
  "gv-theme: no se pudo leer localStorage (almacenamiento del navegador deshabilitado)."

function applyDocumentTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored
    }
  } catch {
    // localStorage bloqueado (CSP/privacidad): resolver por preferencia del SO.
  }
  return "system"
}

// El contenido del script inyectado vía useServerInsertedHTML: corre en el
// HTML inicial (SSR) antes del primer paint, sin pasar por React, así que
// es seguro ante CSP nonce y no dispara el warning de React 19 por <script>.
const THEME_INLINE_SCRIPT = `(function(){try{var s=window.localStorage.getItem("theme");var t=(s==="light"||s==="dark"||s==="system")?s:"system";var r=(t==="system")?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(r);e.style.colorScheme=r}catch(e){}})()`

// Retorna una etiqueta <script> que Next inserta en el payload inicial (SSR)
// fuera del árbol de React. Así el anti-FOUC corre antes del paint sin que
// React tenga que "ejecutar" un script (el warning de React 19 desaparece).
function ThemeInlineScript({ nonce }: { nonce?: string }) {
  useServerInsertedHTML(() => (
    <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }} />
  ))
  return null
}

export function ThemeProvider({
  children,
  nonce,
  disableTransitionOnChange = true,
}: {
  children: React.ReactNode
  nonce?: string
  disableTransitionOnChange?: boolean
}) {
  const [theme, setThemeState] = React.useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(
    "light",
  )

  React.useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)

    const apply = () => {
      const next = readStoredTheme()
      setThemeState(next)
      setResolvedTheme(resolveTheme(next))
      applyDocumentTheme(resolveTheme(next))
    }

    const sync = () => {
      const next = readStoredTheme()
      setResolvedTheme(resolveTheme(next))
      applyDocumentTheme(resolveTheme(next))
    }

    apply()

    // Cambio de preferencia "system" (OS) o nueva pestaña (storage).
    media.addEventListener("change", sync)
    window.addEventListener("storage", sync)
    return () => {
      media.removeEventListener("change", sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme(next) {
        if (!THEMES.includes(next)) return
        setThemeState(next)
        const resolved = resolveTheme(next)
        setResolvedTheme(resolved)
        if (disableTransitionOnChange) {
          const root = document.documentElement
          root.classList.add(NO_TRANSITION_CLASS)
          window.setTimeout(() => root.classList.remove(NO_TRANSITION_CLASS), 0)
        }
        applyDocumentTheme(resolved)
        try {
          window.localStorage.setItem(STORAGE_KEY, next)
        } catch {
          console.warn(STORAGE_ERROR_WARNING)
        }
      },
    }),
    [theme, resolvedTheme, disableTransitionOnChange],
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeInlineScript nonce={nonce} />
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return React.useContext(ThemeContext)
}
