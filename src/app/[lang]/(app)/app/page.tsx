import type { Metadata } from "next"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { Gamepad2 } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlan } from "@/lib/plans"
import { AddGameDialog } from "@/components/inventory/add-game-dialog"
import { CollectionView } from "@/components/inventory/collection-view"
import { toGameSummary } from "@/lib/game-summary"
import { sortPlatforms } from "@/lib/platforms"
import { sortGenresByName } from "@/lib/genres"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  title: "Mi colección",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function CollectionPage() {
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app`)}`)
  }

  const dict = await getDictionary()

  const [games, platforms, genres] = await Promise.all([
    prisma.game.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
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

  const summary = games.map(toGameSummary)
  const inventoryDict = dict.inventory
  // Los desplegables (filtros y alta) van alfabéticos y en el idioma de la
  // página: el orden se fija aquí, no con el `orderBy` de Prisma.
  const platformOptions = sortPlatforms(platforms)
  const genreOptions = sortGenresByName(genres, locale)

  if (summary.length === 0) {
    // Sin juegos todavía solo cabe el estado vacío: la vista completa (que lee
    // `games.length` para las métricas) no se monta.
    const planRow = await getPlan(session.user.plan)
    const limit = planRow?.gameLimit ?? null

    return (
      <div className="collection">
        <header className="collection__head">
          <div className="collection__head-main">
            <p className="collection__eyebrow">
              <span className="collection__eyebrow-dot" aria-hidden="true" />
              {inventoryDict.vaultLabel}
              <span className="collection__eyebrow-sep" aria-hidden="true">
                /
              </span>
              <span className="collection__eyebrow-muted">
                {inventoryDict.catalogLabel}
              </span>
            </p>
            <div className="collection__title-row">
              <h1 className="collection__title">{inventoryDict.collectionTitle}</h1>
              <p className="collection__stats">
                <span className="collection__stats-total">
                  {inventoryDict.totalGamesLabel.replace("{count}", "0")}
                </span>
                {limit !== null && (
                  <>
                    <span className="collection__stats-dot" aria-hidden="true" />
                    <span className="collection__stats-page">
                      {dict.app.totalGames}: 0 / {limit}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </header>

        <div className="empty">
          <div className="empty__icon">
            <Gamepad2 aria-hidden="true" />
          </div>
          <div>
            <p className="empty__title">{dict.app.emptyTitle}</p>
            <p className="page-lead page-lead--spaced">{dict.app.emptyDescription}</p>
          </div>
          <AddGameDialog
            dict={inventoryDict}
            platforms={platformOptions}
            genres={genreOptions}
            lang={locale}
          />
        </div>
      </div>
    )
  }

  return (
    <CollectionView
      games={summary}
      platforms={platformOptions}
      genres={genreOptions}
      dict={inventoryDict}
      lang={locale}
    />
  )
}
