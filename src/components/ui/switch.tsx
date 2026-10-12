"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn, type UiProps } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: UiProps<SwitchPrimitive.Root.Props> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "switch",
        size === "sm" && "switch--sm",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="switch__thumb" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
