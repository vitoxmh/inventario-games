import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@/lib/utils"

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "soft"
  | "success"
  | "warning"
  | "danger"
  | "info"

export type BadgeSize = "default" | "lg"

export type BadgeVariantsOptions = {
  variant?: BadgeVariant
  size?: BadgeSize
  className?: string
}

/** Clases del badge. `variant: "primary"` y `size: "default"` no llevan sufijo. */
export function badgeVariants({
  variant = "primary",
  size = "default",
  className,
}: BadgeVariantsOptions = {}): string {
  return cn(
    "badge",
    variant !== "primary" && `badge--${variant}`,
    size !== "default" && `badge--${size}`,
    className,
  )
}

function Badge({
  className,
  variant = "primary",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & {
  variant?: BadgeVariant
  size?: BadgeSize
}) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: badgeVariants({ variant, size, className }),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge }
