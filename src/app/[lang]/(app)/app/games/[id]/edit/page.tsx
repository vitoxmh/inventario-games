import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { lang } from "next/root-params"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getImageLimit } from "@/lib/plans"
import { toGameSummary } from "@/lib/game-summary"
import { sortPlatforms } from "@/lib/platforms"
import { sortGenresByName } from "@/lib/genres"
import { EditGameForm } from "@/components/inventory/edit-game-form"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(
      `/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app/games/${id}/edit`)}`,
    )
  }

  const dict = await getDictionary()

  const [game, platforms, genres] = await Promise.all([
    prisma.game.findFirst({
      where: { id, userId: session.user.id },
      include: {
        images: { orderBy: { position: "asc" } },
        platform: { select: { name: true } },
        genres: {
          select: {
            genre: {
              select: {
                id: true,
                slug: true,
                nameEs: true,
                nameEn: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    }),
    prisma.platform.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.genre.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, nameEs: true, nameEn: true },
    }),
  ])
  if (!game) notFound()

  const summary = toGameSummary(game)
  const maxImages = await getImageLimit(session.user.plan)
  const canCustomCover = maxImages > 0

  return (
    <EditGameForm
      game={summary}
      dict={dict.inventory}
      lang={locale}
      canCustomCover={canCustomCover}
      maxImages={maxImages}
      // Los desplegables van alfabéticos y en el idioma de la página, así que el
      // orden se fija aquí y no con el `orderBy` de Prisma.
      platforms={sortPlatforms(platforms)}
      genres={sortGenresByName(genres, locale)}
    />
  )
}