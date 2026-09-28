"use client"

import { useTheme } from "@/components/site/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster"
      icons={{
        success: <CircleCheckIcon className="toaster__icon" />,
        info: <InfoIcon className="toaster__icon" />,
        warning: <TriangleAlertIcon className="toaster__icon" />,
        error: <OctagonXIcon className="toaster__icon" />,
        loading: <Loader2Icon className="toaster__icon toaster__icon--loading" />,
      }}
      style={
        {
          "--normal-bg": "var(--gv-surface)",
          "--normal-text": "var(--gv-text)",
          "--normal-border": "var(--gv-border)",
          "--border-radius": "var(--gv-radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
