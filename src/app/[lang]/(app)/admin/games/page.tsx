import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { AdminGamesClient } from "@/components/admin/admin-games-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Elementos",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminGamesPage() {
  const dict = await getDictionary()
  const inventoryDict = dict.inventory

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        kind: true,
        platform: { select: { name: true } },
        genres: { select: { genre: { select: { nameEs: true } } } },
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.game.count(),
  ])

  return (
    <AdminGamesClient
      initialGames={games.map((game) => ({
        id: game.id,
        title: game.title,
        kind: game.kind,
        platform: game.platform?.name ?? null,
        genres: game.genres.map((row) => row.genre.nameEs),
        status: game.status,
        createdAt: game.createdAt.toISOString(),
        ownerEmail: game.user.email,
      }))}
      initialTotal={total}
      dict={dict.admin}
      statuses={inventoryDict.statuses}
      kinds={inventoryDict.kinds}
    />
  )
}