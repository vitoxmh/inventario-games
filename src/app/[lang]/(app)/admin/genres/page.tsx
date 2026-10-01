import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { AdminGenresClient } from "@/components/admin/admin-genres-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Géneros",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminGenresPage() {
  const dict = await getDictionary()

  const genres = await prisma.genre.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      nameEs: true,
      nameEn: true,
      _count: { select: { games: true } },
    },
  })

  return (
    <AdminGenresClient
      initialGenres={genres.map((genre) => ({
        id: genre.id,
        slug: genre.slug,
        nameEs: genre.nameEs,
        nameEn: genre.nameEn,
        gameCount: genre._count.games,
      }))}
      dict={dict.admin}
    />
  )
}
