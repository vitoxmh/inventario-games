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
    <span className={cn("logo", className)}>
      <Gamepad2 className="logo__mark" aria-hidden="true" />
      {name}
    </span>
  )
}
