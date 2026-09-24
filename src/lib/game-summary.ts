import { GameStatus } from "@/generated/prisma/enums"
import type { Game } from "@/generated/prisma/client"

export type GameSummary = {
  id: string
  title: string
  platformId: string
  platform: string
  genre: string | null
  status: keyof typeof GameStatus
  condition: string | null
  purchasePrice: number | null
  purchaseDate: string | null
  notes: string | null
  coverImageUrl: string | null
  playtimeMin: number | null
  createdAt: string
  images: string[]
}

type GameWithImages = Game & {
  images: Array<{ url: string }>
  platform: { name: string }
}

export function toGameSummary(game: GameWithImages): GameSummary {
  return {
    id: game.id,
    title: game.title,
    platformId: game.platformId,
    platform: game.platform.name,
    genre: game.genre,
    status: game.status,
    condition: game.condition,
    purchasePrice: game.purchasePrice != null ? Number(game.purchasePrice) : null,
    purchaseDate: game.purchaseDate?.toISOString() ?? null,
    notes: game.notes,
    coverImageUrl: game.coverImageUrl,
    playtimeMin: game.playtimeMin,
    createdAt: game.createdAt.toISOString(),
    images: game.images.map((image) => image.url),
  }
}