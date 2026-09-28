import type { Metadata } from "next"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import { Gamepad2, Layers, Ticket, DollarSign, Box, Crown } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { Progress } from "@/components/ui/progress"
import { GameStatus } from "@/generated/prisma/enums"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"

export const metadata: Metadata = {
  title: "Estadísticas",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

function BreakdownRow({
  label,
  count,
  total,
}: {
  label: string
  count: number
  total: number
}) {
  return (
    <div className="stats__row">
      <div className="stats__row-head">
        <span className="stats__row-label">{label}</span>
        <span className="stats__row-count">{count}</span>
      </div>
      <Progress value={Math.round((count / total) * 100)} />
    </div>
  )
}

export default async function StatsPage() {
  const session = await auth()
  const currentLocale = await lang()
  const locale = isLocale(currentLocale) ? currentLocale : "es"

  if (!session) {
    redirect(`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/app`)}`)
  }

  const dict = await getDictionary()
  const inventoryDict = dict.inventory

  const games = await prisma.game.findMany({
    where: { userId: session.user.id },
    select: {
      title: true,
      status: true,
      platform: { select: { name: true } },
      genre: true,
      condition: true,
      purchasePrice: true,
      playtimeMin: true,
    },
  })

  const total = games.length
  const value = games.reduce(
    (sum, game) => sum + (game.purchasePrice ? Number(game.purchasePrice) : 0),
    0,
  )
  const avg = total > 0 ? value / total : 0
  const totalPlaytimeHours = games.reduce(
    (sum, game) => sum + (game.playtimeMin ?? 0),
    0,
  ) / 60

  const byStatus = new Map<keyof typeof GameStatus, number>()
  for (const key of Object.keys(GameStatus) as Array<keyof typeof GameStatus>) {
    byStatus.set(key, 0)
  }
  const byPlatform = new Map<string, number>()
  const byGenre = new Map<string, number>()
  let sealed = 0
  let mostExpensive: { title: string; price: number } | null = null

  for (const game of games) {
    byStatus.set(game.status, (byStatus.get(game.status) ?? 0) + 1)
    const platformName = game.platform?.name ?? "—"
    byPlatform.set(platformName, (byPlatform.get(platformName) ?? 0) + 1)
    if (game.genre) byGenre.set(game.genre, (byGenre.get(game.genre) ?? 0) + 1)
    if (game.status === GameStatus.SEALED) sealed += 1
    const price = game.purchasePrice ? Number(game.purchasePrice) : 0
    if (price > 0 && (mostExpensive === null || price > mostExpensive.price)) {
      mostExpensive = { title: game.title, price }
    }
  }

  const topPlatforms = [...byPlatform.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const topGenres = [...byGenre.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const cards = [
    {
      label: dict.app.totalGames,
      value: String(total),
      icon: Gamepad2,
    },
    {
      label: dict.inventory.value,
      value: formatMoney(value),
      icon: DollarSign,
    },
    {
      label: dict.inventory.avgValue,
      value: formatMoney(avg),
      icon: Ticket,
    },
    {
      label: dict.inventory.totalPlaytime,
      value: `${Math.round(totalPlaytimeHours * 10) / 10} ${dict.inventory.playtime}`,
      icon: Layers,
    },
  ]

  return (
    <div className="stats">
      <div className="stats__header">
        <h2 className="stats__title">{dict.inventory.statsTitle}</h2>
        <p className="stats__subtitle">{dict.app.dashboard}</p>
      </div>

      <div className="stats__grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="stats__card">
            <div className="stats__card-label">
              <Icon aria-hidden="true" />
              {label}
            </div>
            <p className="stats__card-value">{value}</p>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <div className="empty">
          <div className="empty__icon">
            <Gamepad2 aria-hidden="true" />
          </div>
          <p className="stats__subtitle">{dict.inventory.noStats}</p>
        </div>
      ) : (
        <div className="stats__sections">
          <section className="stats__section">
            <h3 className="stats__section-title">{dict.inventory.byStatus}</h3>
            <div className="stats__breakdown">
              {[...byStatus.entries()]
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => (
                  <BreakdownRow
                    key={key}
                    label={inventoryDict.statuses[key]}
                    count={count}
                    total={total}
                  />
                ))}
            </div>
          </section>

          <section className="stats__section">
            <h3 className="stats__section-title">{dict.inventory.byPlatform}</h3>
            <div className="stats__breakdown">
              {topPlatforms.map(([platform, count]) => (
                <BreakdownRow
                  key={platform}
                  label={platform}
                  count={count}
                  total={total}
                />
              ))}
            </div>
          </section>

          <section className="stats__section">
            <h3 className="stats__section-title">{dict.inventory.byGenre}</h3>
            <div className="stats__breakdown">
              {topGenres.length > 0 ? (
                topGenres.map(([genre, count]) => (
                  <BreakdownRow
                    key={genre}
                    label={genre}
                    count={count}
                    total={total}
                  />
                ))
              ) : (
                <p className="stats__subtitle">{dict.inventory.noStats}</p>
              )}
            </div>
          </section>

          <section className="stats__section">
            <h3 className="stats__section-title">{dict.inventory.highlights}</h3>
            <div className="stats__breakdown stats__breakdown--center">
              <div className="stats__highlight">
                <Crown className="stats__highlight-icon" aria-hidden="true" />
                <div className="stats__highlight-body">
                  <p className="stats__highlight-title">
                    {mostExpensive
                      ? mostExpensive.title
                      : dict.inventory.total}
                  </p>
                  <p className="stats__highlight-note">
                    {dict.inventory.mostExpensive}
                  </p>
                </div>
                {mostExpensive && (
                  <span className="stats__highlight-value">
                    {formatMoney(mostExpensive.price)}
                  </span>
                )}
              </div>
              <div className="stats__highlight">
                <Box className="stats__highlight-icon" aria-hidden="true" />
                <div className="stats__highlight-body">
                  <p className="stats__highlight-title">{sealed}</p>
                  <p className="stats__highlight-note">
                    {dict.inventory.sealed}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}