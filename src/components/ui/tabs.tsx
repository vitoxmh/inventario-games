"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn, type UiProps } from "@/lib/utils"

export type TabsListVariant = "default" | "line"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: UiProps<TabsPrimitive.Root.Props>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("tabs", className)}
      {...props}
    />
  )
}

/** Clases de la lista de pestañas. `variant: "default"` no lleva sufijo. */
export function tabsListVariants({
  variant = "default",
  className,
}: { variant?: TabsListVariant; className?: string } = {}): string {
  return cn("tabs__list", variant !== "default" && `tabs__list--${variant}`, className)
}

function TabsList({
  className,
  variant = "default",
  ...props
}: UiProps<TabsPrimitive.List.Props> & { variant?: TabsListVariant }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={tabsListVariants({ variant, className })}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: UiProps<TabsPrimitive.Tab.Props>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn("tabs__trigger", className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: UiProps<TabsPrimitive.Panel.Props>) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("tabs__content", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
