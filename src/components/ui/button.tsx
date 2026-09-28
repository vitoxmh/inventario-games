import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cn, type UiProps } from "@/lib/utils"

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "solid-danger"
  | "link"
  | "cta"

export type ButtonSize =
  | "xs"
  | "sm"
  | "default"
  | "lg"
  | "icon-xs"
  | "icon-sm"
  | "icon"
  | "icon-lg"

export type ButtonVariantsOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/**
 * Clases del botón. Se mantiene el objeto de opciones (en vez de una API de
 * modificadores sueltos) porque ocho páginas llaman a `buttonVariants({...})`
 * desde un `<Link>` que no puede usar el componente.
 *
 * `size: "default"` no añade modificador: es el tamaño de la base. Lo mismo con
 * `variant: "primary"`, que es la variante por defecto.
 */
export function buttonVariants({
  variant = "primary",
  size = "default",
  className,
}: ButtonVariantsOptions = {}): string {
  return cn(
    "btn",
    variant !== "primary" && `btn--${variant}`,
    size !== "default" && `btn--${size}`,
    className,
  )
}

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: UiProps<ButtonPrimitive.Props> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  )
}

export { Button }
