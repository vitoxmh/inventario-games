"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Clock, Gamepad2, ListFilter, RotateCcw, Search, Shapes, ArrowUpDown, Rows3, ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GameCardActions } from "@/components/inventory/game-card-actions"
import { GameStatus } from "@/generated/prisma/enums"
import { STATUS_ICONS, type StatusKey } from "@/lib/status-meta"
import type { GameSummary } from "@/lib/game-summary"
import type { Locale } from "@/lib/i18n/locales"
import type { Dictionary } from "@/messages/es"

type InventoryDict = Dictionary["inventory"]

const STATUS_KEYS = Object.keys(GameStatus) as StatusKey[]

type SortKey = "newest" | "title" | "value" | "playtime"

const PAGE_SIZES = [6, 12, 24, 48]
const PAGE_SIZE = 12

function sortGames(list: GameSummary[], sort: SortKey) {
  switch (sort) {
    case "title":
      return [...list].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      )
    case "value":
      return [...list].sort(
        (a, b) => (b.purchasePrice ?? 0) - (a.purchasePrice ?? 0),
      )
    case "playtime":
      return [...list].sort(
        (a, b) => (b.playtimeMin ?? 0) - (a.playtimeMin ?? 0),
      )
    default:
      return list
  }
}

export function InventoryGrid({
  games,
  dict,
  lang,
}: {
  games: GameSummary[]
  dict: InventoryDict
  lang: Locale
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<string>("all")
  const [platform, setPlatform] = useState<string>("all")
  const [genre, setGenre] = useState<string>("all")
  const [sort, setSort] = useState<SortKey>("newest")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)

  const platforms = useMemo(
    () =>
      [...new Set(games.map((g) => g.platform))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    [games],
  )
  const genres = useMemo(
    () =>
      [...new Set(games.flatMap((g) => (g.genre ? [g.genre] : [])))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    [games],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = games.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q)) return false
      if (status !== "all" && g.status !== status) return false
      if (platform !== "all" && g.platform !== platform) return false
      if (genre !== "all" && g.genre !== genre) return false
      return true
    })
    return sortGames(list, sort)
  }, [games, query, status, platform, genre, sort])

  const hasFilters =
    query.trim() !== "" ||
    status !== "all" ||
    platform !== "all" ||
    genre !== "all" ||
    sort !== "newest"

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pages)
  const shown = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function changePageSize(size: number) {
    setPageSize(size)
    setPage(1)
  }

  function resetFilters() {
    setQuery("")
    setStatus("all")
    setPlatform("all")
    setGenre("all")
    setSort("newest")
    setPage(1)
  }

  return (
    <div className="inventory">
      <div className="inventory__filters">
        <div className="inventory__search">
          <Search className="inventory__search-icon" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder={dict.searchCollection}
            autoComplete="off"
          />
        </div>
        <div className="inventory__controls">
          <Select
            value={status}
            onValueChange={(value) => {
              if (value != null) {
                setStatus(value)
                setPage(1)
              }
            }}
            itemToStringLabel={(value) =>
              value === "all"
                ? dict.all
                : value != null && value in dict.statuses
                  ? dict.statuses[value as keyof typeof dict.statuses]
                  : String(value ?? "")
            }
          >
            <SelectTrigger size="sm" aria-label={dict.filterStatus}>
              <ListFilter className="inventory__control-icon" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              {STATUS_KEYS.map((key) => {
                const StatusIcon = STATUS_ICONS[key]
                return (
                  <SelectItem key={key} value={key}>
                    <StatusIcon aria-hidden="true" />
                    {dict.statuses[key]}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <Select
            value={platform}
            onValueChange={(value) => {
              if (value != null) {
                setPlatform(value)
                setPage(1)
              }
            }}
            itemToStringLabel={(value) =>
              value === "all" ? dict.all : String(value ?? "")
            }
          >
            <SelectTrigger size="sm" aria-label={dict.filterPlatform}>
              <Gamepad2 className="inventory__control-icon" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              {platforms.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={genre}
            onValueChange={(value) => {
              if (value != null) {
                setGenre(value)
                setPage(1)
              }
            }}
            itemToStringLabel={(value) =>
              value === "all" ? dict.all : String(value ?? "")
            }
          >
            <SelectTrigger size="sm" aria-label={dict.filterGenre}>
              <Shapes className="inventory__control-icon" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              {genres.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="inventory__separator" aria-hidden="true" />
          <Select
            value={sort}
            onValueChange={(value) => {
              if (value != null) {
                setSort(value as SortKey)
                setPage(1)
              }
            }}
            itemToStringLabel={(value) =>
              value === "newest"
                ? dict.sortNewest
                : value === "title"
                  ? dict.sortTitle
                  : value === "value"
                    ? dict.sortValue
                    : value === "playtime"
                      ? dict.sortPlaytime
                      : String(value ?? "")
            }
          >
            <SelectTrigger size="sm" aria-label={dict.sortBy}>
              <ArrowUpDown className="inventory__control-icon" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{dict.sortNewest}</SelectItem>
              <SelectItem value="title">{dict.sortTitle}</SelectItem>
              <SelectItem value="value">{dict.sortValue}</SelectItem>
              <SelectItem value="playtime">{dict.sortPlaytime}</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
            >
              <RotateCcw className="inventory__reset-icon" aria-hidden="true" />
              {dict.clearFilters}
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">
            <Gamepad2 aria-hidden="true" />
          </div>
          <div className="empty__body">
            <p className="empty__title">{dict.noResultsFilter}</p>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
              >
                <RotateCcw aria-hidden="true" />
                {dict.clearFilters}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="inventory__grid">
            {shown.map((game) => (
              <article key={game.id} className="game-card">
                <Link
                  href={`/${lang}/app/games/${game.id}`}
                  className="game-card__cover"
                  aria-label={game.title}
                >
                  {game.images[0] ?? game.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={game.images[0] ?? game.coverImageUrl ?? ""}
                      alt={game.title}
                      className="game-card__cover-image"
                    />
                  ) : (
                    <div className="game-card__cover-placeholder">
                      <Gamepad2 aria-hidden="true" />
                    </div>
                  )}
                </Link>
                {game.images.length > 1 && (
                  <div className="game-card__thumbs">
                    {game.images.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="game-card__thumb"
                      />
                    ))}
                  </div>
                )}
                <div className="game-card__body">
                  <Link
                    href={`/${lang}/app/games/${game.id}`}
                    className="game-card__title"
                    title={game.title}
                  >
                    {game.title}
                  </Link>
                  <div className="game-card__meta">
                    <p className="game-card__platform">
                      {game.platform}
                      {game.genre ? ` · ${game.genre}` : ""}
                    </p>
                    <Badge variant="secondary">{dict.statuses[game.status]}</Badge>
                  </div>
                  <div className="game-card__footer">
                    {game.playtimeMin != null && game.playtimeMin > 0 ? (
                      <p className="game-card__playtime">
                        <Clock aria-hidden="true" />
                        {Math.round(game.playtimeMin / 60)} {dict.playtime}
                      </p>
                    ) : (
                      <span />
                    )}
                    <GameCardActions
                      game={game}
                      dict={dict}
                      lang={lang}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            <div className="pagination__group">
              <span className="pagination__label">{dict.perPage}</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => value != null && changePageSize(Number(value))}
                itemToStringLabel={(value) => value}
              >
                <SelectTrigger size="sm" aria-label={dict.perPage}>
                  <Rows3 className="inventory__control-icon" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {String(size)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pagination__group">
              <span className="pagination__count">{filtered.length}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft aria-hidden="true" />
                {dict.prev}
              </Button>
              <span className="pagination__count">
                {safePage} / {pages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage >= pages}
                onClick={() => setPage(safePage + 1)}
              >
                {dict.next}
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}