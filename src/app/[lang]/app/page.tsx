import type { Metadata } from "next"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { Gamepad2 } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getPlan } from "@/lib/plans"
import { AddGameDialog } from "@/components/inventory/add-game-dialog"
import { InventoryGrid } from "@/components/inventory/inventory-grid"
import { toGameSummary } from "@/lib/game-summary"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  title: "Mi inventario",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function InventoryPage() {
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app`)}`)
  }

  const dict = await getDictionary()

  const [games, platforms] = await Promise.all([
    prisma.game.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        images: { orderBy: { position: "asc" } },
        platform: { select: { name: true } },
      },
    }),
    prisma.platform.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ])

  const summary = games.map(toGameSummary)

  const planRow = await getPlan(session.user.plan)
  const limit = planRow?.gameLimit ?? null
  const imageLimit = planRow?.imageLimit ?? 1
  const totalImages = games.reduce((n, game) => n + game.images.length, 0)
  const inventoryDict = dict.inventory

  return (
    <div className="u-stack u-stack--lg">
      <div className="page-head">
        <div>
          <h2 className="page-title">
            {dict.app.dashboard}
          </h2>
          <p className="page-lead">
            {dict.app.totalGames}: {games.length}
            {limit !== null ? ` / ${limit}` : ""}
          </p>
          <p className="page-lead">
            {dict.app.totalPhotos}: {totalImages} · {dict.app.photosPerGame}:{" "}
            {imageLimit}
          </p>
        </div>
        <AddGameDialog dict={inventoryDict} platforms={platforms} />
      </div>

      {games.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">
            <Gamepad2 aria-hidden="true" />
          </div>
          <div>
            <p className="empty__title">{dict.app.emptyTitle}</p>
            <p className="page-lead page-lead--spaced">
              {dict.app.emptyDescription}
            </p>
          </div>
          <AddGameDialog dict={inventoryDict} platforms={platforms} />
        </div>
      ) : (
        <InventoryGrid
          games={summary}
          dict={inventoryDict}
          lang={locale}
        />
      )}
    </div>
  )
}