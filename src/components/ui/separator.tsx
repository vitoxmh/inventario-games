"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn, type UiProps } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: UiProps<SeparatorPrimitive.Props>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn("separator", className)}
      {...props}
    />
  )
}

export { Separator }
