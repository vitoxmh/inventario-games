import { Gamepad2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function Logo({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-lg font-semibold tracking-tight",
        className,
      )}
    >
      <Gamepad2 className="size-5 text-primary" aria-hidden="true" />
      {name}
    </span>
  )
}