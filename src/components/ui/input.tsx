import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

export type InputSize = "default" | "sm" | "xs"
export type InputWidth = "auto" | "block" | "w-20" | "w-24" | "w-40" | "w-44"

function Input({
  className,
  type,
  size = "default",
  width = "auto",
  mono = false,
  ...props
}: // `size` y `width` son atributos HTML de <input> con otro tipo, así que se
  // quitan antes de declarar los del componente.
  Omit<React.ComponentProps<"input">, "size" | "width"> & {
    size?: InputSize
    width?: InputWidth
    mono?: boolean
  }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "input",
        size !== "default" && `input--${size}`,
        width !== "auto" && `input--${width}`,
        mono && "input--mono",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
