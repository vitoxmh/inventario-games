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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {dict.app.dashboard}
          </h2>
          <p className="text-sm text-muted-foreground">
            {dict.app.totalGames}: {games.length}
            {limit !== null ? ` / ${limit}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {dict.app.totalPhotos}: {totalImages} · {dict.app.photosPerGame}:{" "}
            {imageLimit}
          </p>
        </div>
        <AddGameDialog dict={inventoryDict} platforms={platforms} />
      </div>

      {games.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Gamepad2 className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium">{dict.app.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
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