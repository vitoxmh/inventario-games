import type { Metadata } from "next"
import type { ReactNode } from "react"
import { lang } from "next/root-params"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowRight,
  Crown,
  DollarSign,
  Gamepad2,
  Heart,
  Layers,
  Lock,
  Tag,
  Ticket,
} from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { Progress } from "@/components/ui/progress"
import { GameStatus } from "@/generated/prisma/enums"
import { getDictionary } from "@/lib/i18n/get-dictionary"
import { isLocale } from "@/lib/i18n/locales"
import { genreName } from "@/lib/genres"
import { isValidImageUrl } from "@/lib/image-url"
import { STATUS_ICONS, type StatusKey } from "@/lib/status-meta"
import {
  COLLECTION_KINDS,
  KIND_ICONS,
  kindSupportsGenre,
  kindSupportsPlatform,
  kindSupportsPlaytime,
  kindSupportsSeries,
  type CollectionKindKey,
} from "@/lib/kinds"

export const metadata: Metadata = {
  title: "Estadísticas",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

const STATUS_KEYS = Object.keys(GameStatus) as StatusKey[]

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
  const percent = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="stats__row">
      <div className="stats__row-head">
        <span className="stats__row-label">{label}</span>
        <span className="stats__row-count">{count}</span>
      </div>
      <Progress value={percent} />
    </div>
  )
}

function Panel({
  title,
  subtitle,
  wide,
  children,
}: {
  title: string
  subtitle?: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <section className={wide ? "stats__panel stats__panel--wide" : "stats__panel"}>
      <header className="stats__panel-head">
        <h3 className="stats__panel-title">{title}</h3>
        {subtitle && <p className="stats__panel-subtitle">{subtitle}</p>}
      </header>
      {children}
    </section>
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
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      platform: { select: { name: true } },
      genres: {
        select: { genre: { select: { slug: true, nameEs: true, nameEn: true } } },
      },
      purchasePrice: true,
      playtimeMin: true,
      series: true,
      coverImageUrl: true,
      createdAt: true,
      images: {
        select: { url: true },
        orderBy: { position: "asc" },
        take: 1,
      },
    },
  })

  const total = games.length
  const value = games.reduce(
    (sum, game) => sum + (game.purchasePrice ? Number(game.purchasePrice) : 0),
    0,
  )
  const avg = total > 0 ? value / total : 0
  const pricedCount = games.filter((game) => Number(game.purchasePrice) > 0).length
  const playedCount = games.filter(
    (game) => kindSupportsPlaytime(game.kind) && (game.playtimeMin ?? 0) > 0,
  ).length
  const totalPlaytimeHours =
    games.reduce(
      (sum, game) =>
        kindSupportsPlaytime(game.kind) ? sum + (game.playtimeMin ?? 0) : sum,
      0,
    ) / 60

  const byStatus = new Map<StatusKey, { count: number; value: number }>()
  for (const key of STATUS_KEYS) byStatus.set(key, { count: 0, value: 0 })
  const byKind = new Map<CollectionKindKey, { count: number; value: number }>()
  for (const key of COLLECTION_KINDS) byKind.set(key, { count: 0, value: 0 })
  const byPlatform = new Map<string, number>()
  const byGenre = new Map<string, number>()
  const genreLabels = new Map<string, string>()
  const seriesStats = new Map<string, { name: string; count: number; value: number }>()
  let mostExpensive: { id: string; title: string; price: number } | null = null

  for (const game of games) {
    const price = game.purchasePrice ? Number(game.purchasePrice) : 0

    const statusRow = byStatus.get(game.status as StatusKey)
    if (statusRow) {
      statusRow.count += 1
      statusRow.value += price
    }

    const kindRow = byKind.get(game.kind as CollectionKindKey)
    if (kindRow) {
      kindRow.count += 1
      kindRow.value += price
    }

    if (kindSupportsPlatform(game.kind)) {
      const platformName = game.platform?.name ?? inventoryDict.noPlatform
      byPlatform.set(platformName, (byPlatform.get(platformName) ?? 0) + 1)
    }

    // Un juego con dos géneros cuenta en los dos: es un breakdown por faceta, no
    // un reparto, así que la suma de las barras puede pasar del total.
    if (kindSupportsGenre(game.kind)) {
      for (const row of game.genres) {
        const slug = row.genre.slug
        byGenre.set(slug, (byGenre.get(slug) ?? 0) + 1)
        genreLabels.set(slug, genreName(row.genre, locale))
      }
    }

    if (kindSupportsSeries(game.kind) && game.series?.trim()) {
      const name = game.series.trim()
      const key = name.toLocaleLowerCase(locale)
      const current = seriesStats.get(key)
      if (current) {
        current.count += 1
        current.value += price
      } else {
        seriesStats.set(key, { name, count: 1, value: price })
      }
    }

    if (price > 0 && (mostExpensive === null || price > mostExpensive.price)) {
      mostExpensive = { id: game.id, title: game.title, price }
    }
  }

  const genreLabelOf = (slug: string) => genreLabels.get(slug) ?? slug

  const topPlatforms = [...byPlatform.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
    )
    .slice(0, 6)
  const topGenres = [...byGenre.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        genreLabelOf(a[0]).localeCompare(genreLabelOf(b[0]), locale, {
          sensitivity: "base",
        }),
    )
    .slice(0, 6)
  const topSeries = [...seriesStats.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.value - a.value ||
        a.name.localeCompare(b.name, locale, { sensitivity: "base" }),
    )
    .slice(0, 5)

  const platformCapable = games.filter((game) => kindSupportsPlatform(game.kind)).length
  const genreCapable = games.filter((game) => kindSupportsGenre(game.kind)).length

  const kindHint = [...byKind.entries()]
    .filter(([, row]) => row.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2)
    .map(([key, row]) => `${row.count} ${inventoryDict.kinds[key]}`)
    .join(" · ")

  // Últimos seis meses, incluido el actual. Las claves van en UTC para que el
  // corte no dependa de la zona horaria del servidor.
  const now = new Date()
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  })
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1),
    )
    return {
      key: `${date.getUTCFullYear()}-${date.getUTCMonth()}`,
      label: monthFormatter.format(date),
      count: 0,
    }
  })
  const monthIndex = new Map(months.map((month, index) => [month.key, index]))
  for (const game of games) {
    const key = `${game.createdAt.getUTCFullYear()}-${game.createdAt.getUTCMonth()}`
    const index = monthIndex.get(key)
    if (index != null) months[index].count += 1
  }
  const monthMax = Math.max(1, ...months.map((month) => month.count))

  const recent = games.slice(0, 5).map((game) => {
    const candidate = game.images[0]?.url ?? game.coverImageUrl
    return {
      ...game,
      cover: candidate && isValidImageUrl(candidate) ? candidate : null,
    }
  })

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  const cards = [
    {
      key: "total",
      label: dict.app.totalGames,
      value: String(total),
      hint: kindHint,
      icon: Layers,
      tone: "violet",
    },
    {
      key: "value",
      label: dict.inventory.value,
      value: formatMoney(value),
      hint: inventoryDict.itemsWithPrice.replace("{count}", String(pricedCount)),
      icon: DollarSign,
      tone: "cyan",
    },
    {
      key: "avg",
      label: dict.inventory.avgValue,
      value: formatMoney(avg),
      hint: inventoryDict.avgOver.replace("{count}", String(total)),
      icon: Ticket,
      tone: "pink",
    },
    {
      key: "playtime",
      label: dict.inventory.totalPlaytime,
      value: String(Math.round(totalPlaytimeHours)),
      hint: inventoryDict.gamesCount.replace("{count}", String(playedCount)),
      icon: Gamepad2,
      tone: "lilac",
    },
  ]

  const focus = [
    { key: GameStatus.WISHLIST, icon: Heart, tone: "pink" },
    { key: GameStatus.SELLING, icon: Tag, tone: "violet" },
    { key: GameStatus.SEALED, icon: Lock, tone: "cyan" },
  ] as const

  return (
    <div className="stats">
      <header className="stats__header">
        <div className="stats__header-copy">
          <p className="stats__eyebrow">
            <span className="stats__eyebrow-dot" aria-hidden="true" />
            {inventoryDict.vaultLabel}
            <span className="stats__eyebrow-sep" aria-hidden="true">/</span>
            <span className="stats__eyebrow-muted">{inventoryDict.statsTitle}</span>
          </p>
          <h1 className="stats__title">{inventoryDict.statsTitle}</h1>
          <p className="stats__subtitle">{inventoryDict.statsSubtitle}</p>
        </div>
        <div className="stats__header-side">
          <div className="stats__chips">
            <span className="stats__chip">
              <Layers aria-hidden="true" />
              {inventoryDict.totalGamesLabel.replace("{count}", String(total))}
            </span>
            <span className="stats__chip">
              <DollarSign aria-hidden="true" />
              {formatMoney(value)}
            </span>
          </div>
          <Link className="stats__cta" href={`/${locale}/app`}>
            {inventoryDict.viewCollection}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="stats__grid">
        {cards.map(({ key, label, value: cardValue, hint, icon: Icon, tone }) => (
          <article key={key} className="stats__card" data-tone={tone}>
            <span className="stats__card-icon">
              <Icon aria-hidden="true" />
            </span>
            <div className="stats__card-body">
              <p className="stats__card-label">{label}</p>
              <p className="stats__card-value">{cardValue}</p>
              {hint && <p className="stats__card-hint">{hint}</p>}
            </div>
          </article>
        ))}
      </div>

      {total === 0 ? (
        <div className="empty">
          <div className="empty__icon">
            <Gamepad2 aria-hidden="true" />
          </div>
          <p className="stats__subtitle">{inventoryDict.noStats}</p>
        </div>
      ) : (
        <div className="stats__sections">
          <Panel title={inventoryDict.summaryByKind} wide>
            <div className="stats__kind-grid">
              {COLLECTION_KINDS.map((key) => {
                const stat = byKind.get(key) ?? { count: 0, value: 0 }
                const percent = total > 0 ? Math.round((stat.count / total) * 100) : 0
                const Icon = KIND_ICONS[key]
                return (
                  <article
                    key={key}
                    className="stats__kind-card"
                    data-kind={key}
                    data-empty={stat.count === 0 ? true : undefined}
                  >
                    <div className="stats__kind-head">
                      <span className="stats__kind-icon">
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="stats__kind-percent">{percent}%</span>
                    </div>
                    <p className="stats__kind-label">{inventoryDict.kinds[key]}</p>
                    <p className="stats__kind-count">{stat.count}</p>
                    <p className="stats__kind-value">
                      {formatMoney(stat.value)}
                    </p>
                    <div className="stats__kind-bar" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </article>
                )
              })}
            </div>
          </Panel>

          <Panel title={inventoryDict.byMonth} subtitle={inventoryDict.lastMonths}>
            <div className="stats__months">
              {months.map((month) => (
                <div key={month.key} className="stats__month">
                  <span className="stats__month-value">{month.count}</span>
                  <div className="stats__month-track">
                    <span
                      className="stats__month-bar"
                      style={{
                        height: `${Math.max(
                          month.count > 0 ? 8 : 3,
                          Math.round((month.count / monthMax) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="stats__month-label">{month.label}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={inventoryDict.statusFocus}>
            <div className="stats__focus-grid">
              {focus.map(({ key, icon: Icon, tone }) => {
                const stat = byStatus.get(key) ?? { count: 0, value: 0 }
                return (
                  <div key={key} className="stats__focus" data-tone={tone}>
                    <span className="stats__focus-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <p className="stats__focus-label">{inventoryDict.statuses[key]}</p>
                    <p className="stats__focus-count">{stat.count}</p>
                    <p className="stats__focus-value">{formatMoney(stat.value)}</p>
                  </div>
                )
              })}
            </div>
            <div className="stats__spotlight">
              <span className="stats__spotlight-icon">
                <Crown aria-hidden="true" />
              </span>
              <div className="stats__spotlight-copy">
                <p className="stats__spotlight-label">
                  {inventoryDict.mostExpensive}
                </p>
                {mostExpensive ? (
                  <Link
                    className="stats__spotlight-title"
                    href={`/${locale}/app/games/${mostExpensive.id}`}
                  >
                    {mostExpensive.title}
                  </Link>
                ) : (
                  <p className="stats__spotlight-title">{inventoryDict.total}</p>
                )}
              </div>
              {mostExpensive && (
                <span className="stats__spotlight-value">
                  {formatMoney(mostExpensive.price)}
                </span>
              )}
            </div>
          </Panel>

          <Panel title={inventoryDict.topSeries}>
            {topSeries.length > 0 ? (
              <ol className="stats__series">
                {topSeries.map((series, index) => (
                  <li key={series.name} className="stats__series-item">
                    <span className="stats__series-rank">{index + 1}</span>
                    <div className="stats__series-copy">
                      <p className="stats__series-name">{series.name}</p>
                      <p className="stats__series-count">
                        {inventoryDict.itemCount.replace(
                          "{count}",
                          String(series.count),
                        )}
                      </p>
                    </div>
                    {series.value > 0 && (
                      <span className="stats__series-value">
                        {formatMoney(series.value)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="stats__empty-note">{inventoryDict.topSeriesEmpty}</p>
            )}
          </Panel>

          <Panel title={inventoryDict.byStatus}>
            <div className="stats__breakdown">
              {[...byStatus.entries()]
                .filter(([, row]) => row.count > 0)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([key, row]) => (
                  <BreakdownRow
                    key={key}
                    label={inventoryDict.statuses[key]}
                    count={row.count}
                    total={total}
                  />
                ))}
            </div>
          </Panel>

          <Panel title={inventoryDict.byPlatform}>
            <div className="stats__breakdown">
              {topPlatforms.length > 0 ? (
                topPlatforms.map(([platform, count]) => (
                  <BreakdownRow
                    key={platform}
                    label={platform}
                    count={count}
                    total={platformCapable}
                  />
                ))
              ) : (
                <p className="stats__empty-note">{inventoryDict.noStats}</p>
              )}
            </div>
          </Panel>

          <Panel title={inventoryDict.byGenre}>
            <div className="stats__breakdown">
              {topGenres.length > 0 ? (
                topGenres.map(([genre, count]) => (
                  <BreakdownRow
                    key={genre}
                    label={genreLabelOf(genre)}
                    count={count}
                    total={genreCapable}
                  />
                ))
              ) : (
                <p className="stats__empty-note">{inventoryDict.noStats}</p>
              )}
            </div>
          </Panel>

          <Panel title={inventoryDict.recentAdditions} wide>
            <ul className="stats__recent">
              {recent.map((game) => {
                const KindIcon = KIND_ICONS[game.kind as CollectionKindKey]
                const StatusIcon = STATUS_ICONS[game.status as StatusKey]
                return (
                  <li key={game.id} className="stats__recent-item">
                    <Link
                      className="stats__recent-link"
                      href={`/${locale}/app/games/${game.id}`}
                    >
                      <span className="stats__recent-thumb">
                        {game.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={game.cover} alt={game.title} />
                        ) : (
                          <KindIcon aria-hidden="true" />
                        )}
                      </span>
                      <span className="stats__recent-copy">
                        <span className="stats__recent-title">{game.title}</span>
                        <span className="stats__recent-meta">
                          {inventoryDict.kinds[game.kind as CollectionKindKey]}
                          {" · "}
                          {dateFormatter.format(game.createdAt)}
                        </span>
                      </span>
                      <span
                        className="stats__recent-status"
                        data-status={game.status}
                      >
                        <StatusIcon aria-hidden="true" />
                        {inventoryDict.statuses[game.status as StatusKey]}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  )
}
