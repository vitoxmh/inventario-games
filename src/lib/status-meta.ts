import {
  CloudDownload,
  Disc3,
  Heart,
  Lock,
  Package,
  PackageCheck,
  Tag,
  type LucideIcon,
} from "lucide-react"
import { GameStatus } from "@/generated/prisma/enums"

export type StatusKey = keyof typeof GameStatus

export const STATUS_ICONS = {
  [GameStatus.OWNED]: Package,
  [GameStatus.SEALED]: Lock,
  [GameStatus.CIB]: PackageCheck,
  [GameStatus.LOOSE]: Disc3,
  [GameStatus.DIGITAL]: CloudDownload,
  [GameStatus.WISHLIST]: Heart,
  [GameStatus.SELLING]: Tag,
} satisfies Record<StatusKey, LucideIcon>
