"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Clock, Gamepad2, RotateCcw, Search } from "lucide-react"
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
import type { GameSummary } from "@/lib/game-summary"
import type { Locale } from "@/lib/i18n/locales"
import type { Dictionary } from "@/messages/es"

type InventoryDict = Dictionary["inventory"]

const STATUS_KEYS = Object.keys(GameStatus) as Array<keyof typeof GameStatus>

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder={dict.searchCollection}
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              {STATUS_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {dict.statuses[key]}
                </SelectItem>
              ))}
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
          >
            <SelectTrigger size="sm" aria-label={dict.filterPlatform}>
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
          >
            <SelectTrigger size="sm" aria-label={dict.filterGenre}>
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
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
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
              className="inline-flex items-center gap-1.5"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {dict.clearFilters}
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Gamepad2 className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium">{dict.noResultsFilter}</p>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="mt-3"
              >
                {dict.clearFilters}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((game) => (
            <div
              key={game.id}
              className="flex flex-col overflow-hidden rounded-xl border bg-card"
            >
              <Link
                href={`/${lang}/app/games/${game.id}`}
                className="group/cover block"
                aria-label={game.title}
              >
                {game.images[0] ?? game.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.images[0] ?? game.coverImageUrl ?? ""}
                    alt={game.title}
                    className="aspect-[3/4] w-full object-cover transition-opacity group-hover/cover:opacity-90"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted">
                    <Gamepad2
                      className="size-10 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </Link>
              {game.images.length > 1 && (
                <div className="flex gap-1 border-t bg-muted/40 px-1 py-1">
                  {game.images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="size-8 flex-1 rounded border object-cover"
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <Link
                  href={`/${lang}/app/games/${game.id}`}
                  className="truncate text-sm font-medium hover:underline"
                  title={game.title}
                >
                  {game.title}
                </Link>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {game.platform}
                    {game.genre ? ` · ${game.genre}` : ""}
                  </p>
                  <Badge variant="secondary" className="shrink-0">
                    {dict.statuses[game.status]}
                  </Badge>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {game.playtimeMin != null && game.playtimeMin > 0 ? (
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" aria-hidden="true" />
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
            </div>
))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{dict.perPage}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => value != null && changePageSize(Number(value))}
              itemToStringLabel={(value) => value}
            >
              <SelectTrigger size="sm" aria-label={dict.perPage}>
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {filtered.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              {dict.prev}
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
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
            </Button>
          </div>
          </div>
        </>
      )}
    </div>
  )
}