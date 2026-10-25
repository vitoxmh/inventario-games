"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowRight,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Gamepad2,
  LayoutGrid,
  List,
  ListFilter,
  RotateCcw,
  Search,
  Shapes,
  X,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GameCardActions } from "@/components/inventory/game-card-actions"
import { RatingStars } from "@/components/inventory/rating"
import { ratingLabel } from "@/lib/rating"
import { GameStatus } from "@/generated/prisma/enums"
import {
  COLLECTION_KINDS,
  KIND_ICONS,
  kindSupportsDeveloper,
  kindSupportsGenre,
  kindSupportsPlatform,
  kindSupportsPlaytime,
  kindSupportsReleaseYear,
  kindSupportsSeries,
  kindSupportsVolume,
  type CollectionKindKey,
} from "@/lib/kinds"
import { STATUS_ICONS, type StatusKey } from "@/lib/status-meta"
import { genreName, genreNames, type GenreOption } from "@/lib/genres"
import { conditionLabel } from "@/lib/conditions"
import { isPhysicalStatus, presentLabel } from "@/lib/game-parts"
import type { GameSummary } from "@/lib/game-summary"
import type { Locale } from "@/lib/i18n/locales"
import type { Dictionary } from "@/messages/es"
import type { PlatformOption } from "@/lib/platforms"
import { AddGameDialog } from "@/components/inventory/add-game-dialog"

type InventoryDict = Dictionary["inventory"]

type SortKey = "newest" | "title" | "value" | "playtime"
type ViewMode = "grid" | "list"

const STATUS_KEYS = Object.keys(GameStatus) as StatusKey[]

// El diseño ofrece 12/24/48/96 por página; 12 es el valor inicial.
const PAGE_SIZES = [12, 24, 48, 96]
const PAGE_SIZE = 12

// Tono de la píldora de estado sobre la portada. El diseño usa cuatro
// treatments (primario, secundario, neutro y apagado) y los estados del
// esquema se agrupan en ellos.
  const STATUS_TONES: Record<StatusKey, "primary" | "secondary" | "neutral" | "muted"> =
  {
    [GameStatus.OWNED]: "primary",
    [GameStatus.SEALED]: "primary",
    [GameStatus.LOOSE]: "primary",
    [GameStatus.DIGITAL]: "secondary",
    [GameStatus.SELLING]: "neutral",
    [GameStatus.WISHLIST]: "muted",
  }

// "Filtros rápidos" del diseño: atajos a los estados más consultados.
const QUICK_STATUSES: StatusKey[] = [
  GameStatus.DIGITAL,
  GameStatus.WISHLIST,
  GameStatus.SELLING,
]

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

// La moneda del diseño es siempre USD, con el símbolo delante del importe en
// ambos idiomas, así que no se delega en `Intl`.
function formatPrice(value: number | null) {
  if (value == null) return "—"
  return `$${value.toFixed(2)} USD`
}

/**
 * Etiquetas de los géneros de un juego en una celda: la columna del CSV es una
 * sola, así que van separadas por "; ", que además es lo que Excel no confunde
 * con el separador de la propia coma del archivo.
 */
function genreLabelsOf(game: GameSummary, lang: Locale): string {
  return genreNames(game.genres, lang).join("; ")
}

function csvCell(value: string | number | null) {
  if (value == null) return ""
  const text = String(value)
  return /["\n;,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(
  games: GameSummary[],
  dict: InventoryDict,
  lang: Locale,
) {
  if (games.length === 0) {
    toast.error(dict.csvEmpty)
    return
  }

  const header = [
    dict.titleLabel,
    dict.kindLabel,
    dict.platform,
    dict.genre,
    dict.csvDeveloper,
    dict.csvPublisher,
    dict.series,
    dict.volume,
    dict.releaseYear,
    dict.csvRating,
    dict.statusLabel,
    dict.condition,
    dict.partsLabel,
    dict.playtimeLabel,
    dict.purchasePrice,
    dict.purchaseDate,
    dict.galleryTitle,
  ]
  const rows = games.map((game) =>
    [
      game.title,
      dict.kinds[game.kind],
      kindSupportsPlatform(game.kind) ? game.platform : null,
      kindSupportsGenre(game.kind) ? genreLabelsOf(game, lang) : "",
      kindSupportsDeveloper(game.kind) ? game.developer : null,
      game.publisher,
      kindSupportsSeries(game.kind) ? game.series : null,
      kindSupportsVolume(game.kind) ? game.volume : null,
      kindSupportsReleaseYear(game.kind) ? game.releaseYear : null,
      game.rating,
      dict.statuses[game.status],
      conditionLabel(game.condition, dict.conditions),
      // En el CSV, la columna solo dice algo en las copias físicas: una copia
      // digital no tiene caja ni manual que comprobar, así que se deja vacía en
      // vez de pintar "no tiene ninguna".
      isPhysicalStatus(game.status) && game.kind === "GAME"
        ? presentLabel(game.parts, dict.parts)
        : "",
      kindSupportsPlaytime(game.kind) && game.playtimeMin != null
        ? Math.round(game.playtimeMin / 60)
        : null,
      game.purchasePrice,
      game.purchaseDate,
      game.images.length,
    ]
      .map(csvCell)
      .join(","),
  )

  const blob = new Blob([["\uFEFF", header.map(csvCell).join(","), ...rows].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `questvault-coleccion-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success(dict.csvExported)
}

// Números de página con elipsis: 1 2 3 … 11.
function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...pages]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)

  const out: (number | "gap")[] = []
  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push("gap")
    out.push(page)
    previous = page
  }
  return out
}

export function CollectionView({
  games,
  platforms,
  genres,
  dict,
  lang,
}: {
  games: GameSummary[]
  platforms: PlatformOption[]
  genres: GenreOption[]
  dict: InventoryDict
  lang: Locale
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<string>("all")
  const [kind, setKind] = useState<string>("all")
  const [platform, setPlatform] = useState<string>("all")
  const [genre, setGenre] = useState<string>("all")
  const [sort, setSort] = useState<SortKey>("newest")
  const [view, setView] = useState<ViewMode>("grid")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [jump, setJump] = useState("")

  const platformNames = useMemo(
    () =>
      [
        ...new Set(
          games.flatMap((game) => (game.platform ? [game.platform] : [])),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [games],
  )
// El desplegable ofrece el listado entero, no solo los géneros que hay en
  // pantalla: así se ve que existe una categoría sin juegos en vez de que
  // desaparezca del filtro.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = games.filter((game) => {
      if (q) {
        const haystack =
          `${game.title} ${game.platform} ${genreLabelsOf(game, lang)} ${game.developer ?? ""} ${game.publisher ?? ""} ${game.series ?? ""} ${game.volume ?? ""} ${game.releaseYear ?? ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (status !== "all" && game.status !== status) return false
      if (kind !== "all" && game.kind !== kind) return false
      if (platform !== "all" && game.platform !== platform) return false
      // Con varios géneros por juego, el filtro es "incluye este": basta con que
      // uno de los del juego sea el elegido.
      if (genre !== "all" && !game.genres.some((item) => item.id === genre)) {
        return false
      }
      return true
    })
    return sortGames(list, sort)
  }, [games, query, status, kind, platform, genre, sort, lang])

  const hasFilters =
    query.trim() !== "" ||
    status !== "all" ||
    kind !== "all" ||
    platform !== "all" ||
    genre !== "all" ||
    sort !== "newest"

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pages)
  const shown = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeTo = Math.min(safePage * pageSize, filtered.length)

  function goToPage(next: number) {
    setPage(Math.min(Math.max(next, 1), pages))
  }

  function changePageSize(size: number) {
    setPageSize(size)
    setPage(1)
  }

  function toggleStatus(next: string) {
    setStatus((current) => (current === next ? "all" : next))
    setPage(1)
  }

  function resetFilters() {
    setQuery("")
    setStatus("all")
    setKind("all")
    setPlatform("all")
    setGenre("all")
    setSort("newest")
    setPage(1)
  }

  function submitJump() {
    const value = Number.parseInt(jump, 10)
    if (Number.isFinite(value)) goToPage(value)
    setJump("")
  }

  return (
    <div className="collection">
      {/* Cabecera de sección: eyebrow, título, métricas y acciones */}
      <header className="collection__head">
        <div className="collection__head-main">
          <p className="collection__eyebrow">
            <span className="collection__eyebrow-dot" aria-hidden="true" />
            {dict.vaultLabel}
            <span className="collection__eyebrow-sep" aria-hidden="true">
              /
            </span>
            <span className="collection__eyebrow-muted">{dict.catalogLabel}</span>
          </p>
          <div className="collection__title-row">
            <h1 className="collection__title">{dict.collectionTitle}</h1>
            <p className="collection__stats">
              <span className="collection__stats-total">
                {dict.totalGamesLabel.replace("{count}", String(games.length))}
              </span>
              <span className="collection__stats-dot" aria-hidden="true" />
              <span className="collection__stats-page">
                {shown.length} {dict.onThisPage}
              </span>
            </p>
          </div>
        </div>

        <div className="collection__actions">
          <button
            type="button"
            className="collection__export"
            onClick={() => downloadCsv(filtered, dict, lang)}
          >
            <Download className="collection__export-icon" aria-hidden="true" />
            {dict.exportCsv}
          </button>
          <AddGameDialog
            dict={dict}
            platforms={platforms}
            genres={genres}
            lang={lang}
            triggerClassName="collection__add"
            triggerLabel={dict.addNewGame}
          />
        </div>
      </header>

      {/* Toolbar de búsqueda, filtros y vista */}
      <section className="collection__toolbar">
        <div className="collection__toolbar-row">
          <div className="collection__search">
            <Search className="collection__search-icon" aria-hidden="true" />
            <input
              type="text"
              className="collection__search-input"
              placeholder={dict.collectionSearch}
              aria-label={dict.searchCollection}
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
            {query !== "" && (
              <button
                type="button"
                className="collection__search-clear"
                aria-label={dict.clearFilters}
                onClick={() => {
                  setQuery("")
                  setPage(1)
                }}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="collection__selects">
            <Select
              value={kind}
              onValueChange={(value) => {
                if (value != null) {
                  setKind(value)
                  setPage(1)
                }
              }}
              itemToStringLabel={(value) =>
                value === "all"
                  ? dict.all
                  : value != null
                    ? dict.kinds[value as CollectionKindKey] ?? String(value)
                    : ""
              }
            >
              <SelectTrigger className="collection__select" aria-label={dict.filterKind}>
                <span className="collection__select-body">
                  <span className="collection__select-label">
                    <ListFilter aria-hidden="true" />
                    {dict.filterKind}
                  </span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{dict.all}</SelectItem>
                {COLLECTION_KINDS.map((key) => {
                  const KindIcon = KIND_ICONS[key]
                  return (
                    <SelectItem key={key} value={key}>
                      <KindIcon aria-hidden="true" />
                      {dict.kinds[key]}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

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
                    ? dict.statuses[value as StatusKey]
                    : String(value ?? "")
              }
            >
              <SelectTrigger className="collection__select" aria-label={dict.filterStatus}>
                <span className="collection__select-body">
                  <span className="collection__select-label">
                    <ListFilter aria-hidden="true" />
                    {dict.filterStatus}
                  </span>
                  <SelectValue />
                </span>
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
              value={genre}
              onValueChange={(value) => {
                if (value != null) {
                  setGenre(value)
                  setPage(1)
                }
              }}
              itemToStringLabel={(value) => {
                if (value === "all" || value == null) return dict.all
                const found = genres.find((genre) => genre.id === value)
                return found ? genreName(found, lang) : String(value)
              }}
            >
              <SelectTrigger className="collection__select" aria-label={dict.filterGenre}>
                <span className="collection__select-body">
                  <span className="collection__select-label">
                    <Shapes aria-hidden="true" />
                    {dict.filterGenre}
                  </span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{dict.all}</SelectItem>
{genres.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {genreName(item, lang)}
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
              itemToStringLabel={(value) =>
                value === "all" ? dict.all : String(value ?? "")
              }
            >
              <SelectTrigger
                className="collection__select"
                aria-label={dict.filterPlatform}
              >
                <span className="collection__select-body">
                  <span className="collection__select-label">
                    <Gamepad2 aria-hidden="true" />
                    {dict.filterPlatform}
                  </span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{dict.all}</SelectItem>
                {platformNames.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
              <SelectTrigger className="collection__select" aria-label={dict.sortBy}>
                <span className="collection__select-body">
                  <span className="collection__select-label">
                    <ArrowUpDown aria-hidden="true" />
                    {dict.sortBy}
                  </span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{dict.sortNewest}</SelectItem>
                <SelectItem value="title">{dict.sortTitle}</SelectItem>
                <SelectItem value="value">{dict.sortValue}</SelectItem>
                <SelectItem value="playtime">{dict.sortPlaytime}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="collection__toolbar-foot">
          <div className="collection__quick">
            <span className="collection__quick-label">{dict.quickFilters}</span>
            {QUICK_STATUSES.map((key) => {
              const active = status === key
              return (
                <button
                  key={key}
                  type="button"
                  className={
                    active
                      ? "collection__chip collection__chip--active"
                      : "collection__chip"
                  }
                  aria-pressed={active}
                  onClick={() => toggleStatus(key)}
                >
                  {dict.statuses[key]}
                  {active && <X aria-hidden="true" />}
                </button>
              )
            })}
            {hasFilters && (
              <button
                type="button"
                className="collection__clear"
                onClick={resetFilters}
              >
                <RotateCcw aria-hidden="true" />
                {dict.clearFilters}
              </button>
            )}
          </div>

          <div className="collection__view-toggle">
            <button
              type="button"
              className={
                view === "grid"
                  ? "collection__view-btn collection__view-btn--active"
                  : "collection__view-btn"
              }
              title={dict.viewGrid}
              aria-label={dict.viewGrid}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid aria-hidden="true" />
            </button>
            <button
              type="button"
              className={
                view === "list"
                  ? "collection__view-btn collection__view-btn--active"
                  : "collection__view-btn"
              }
              title={dict.viewList}
              aria-label={dict.viewList}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Catálogo */}
      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">
            <Gamepad2 aria-hidden="true" />
          </div>
          <div className="empty__body">
            <p className="empty__title">{dict.noResultsFilter}</p>
            {hasFilters && (
              <button type="button" className="collection__clear" onClick={resetFilters}>
                <RotateCcw aria-hidden="true" />
                {dict.clearFilters}
              </button>
            )}
          </div>
        </div>
      ) : view === "grid" ? (
        <div className="collection__grid">
          {shown.map((game) => (
            <GameCard key={game.id} game={game} dict={dict} lang={lang} />
          ))}
        </div>
      ) : (
        <ul className="collection__list">
          {shown.map((game) => (
            <li key={game.id}>
              <GameCard game={game} dict={dict} lang={lang} list />
            </li>
          ))}
        </ul>
      )}

      {/* Paginación */}
      {filtered.length > 0 && (
        <section className="collection__pagination">
          <div className="collection__pagination-info">
            <label className="collection__page-size">
              <span>{dict.showing}:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) =>
                  value != null && changePageSize(Number(value))
                }
                itemToStringLabel={(value) => value}
              >
                <SelectTrigger
                  className="collection__page-size-select"
                  aria-label={dict.perPage}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <p className="collection__page-stats">
              {dict.pageOf
                .replace("{page}", String(safePage))
                .replace("{pages}", String(pages))}
              <span className="collection__page-bullet" aria-hidden="true">
                •
              </span>
              {dict.showingRange
                .replace("{from}", String(rangeFrom))
                .replace("{to}", String(rangeTo))
                .replace("{total}", String(filtered.length))}
            </p>
          </div>

          <div className="collection__page-nav">
            <button
              type="button"
              className="collection__page-arrow"
              title={dict.prev}
              aria-label={dict.prev}
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            {pageItems(safePage, pages).map((item, index) =>
              item === "gap" ? (
                <span
                  key={`gap-${index}`}
                  className="collection__page-gap"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={
                    item === safePage
                      ? "collection__page-btn collection__page-btn--active"
                      : "collection__page-btn"
                  }
                  aria-current={item === safePage ? "page" : undefined}
                  onClick={() => goToPage(item)}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              className="collection__page-arrow"
              title={dict.next}
              aria-label={dict.next}
              disabled={safePage >= pages}
              onClick={() => goToPage(safePage + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          <form
            className="collection__jump"
            onSubmit={(event) => {
              event.preventDefault()
              submitJump()
            }}
          >
            <label className="collection__jump-label" htmlFor="collection-jump">
              {dict.jumpToPage}
            </label>
            <input
              id="collection-jump"
              type="number"
              inputMode="numeric"
              className="collection__jump-input"
              min={1}
              max={pages}
              placeholder="1"
              value={jump}
              onChange={(event) => setJump(event.target.value)}
            />
            <button type="submit" className="collection__jump-btn">
              {dict.go}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}

/*
 * Tarjeta de juego.
 *
 * El diseño muestra la portada a 16:10 con dos píldoras superpuestas (estado a
 * la izquierda, formato a la derecha), una píldora de plataforma con las horas
 * jugadas, el título, la línea de metadatos y el pie con el valor estimado y el
 * enlace a la ficha. El menú de acciones se monta sobre la portada para no
 * romper la composición del pie.
 */
function GameCard({
  game,
  dict,
  lang,
  list = false,
}: {
  game: GameSummary
  dict: InventoryDict
  lang: Locale
  list?: boolean
}) {
  const StatusIcon = STATUS_ICONS[game.status]
  const KindIcon = KIND_ICONS[game.kind]
  const cover = game.images[0] ?? game.coverImageUrl
  const isDigital = game.status === GameStatus.DIGITAL
  const hasPlaytime = kindSupportsPlaytime(game.kind)
  const hasReleaseYear = kindSupportsReleaseYear(game.kind)
  const hours =
    hasPlaytime && game.playtimeMin != null
      ? Math.round(game.playtimeMin / 60)
      : null
  const playtime = !hasPlaytime
    ? null
    : hours == null || hours === 0
      ? dict.inLibrary
      : dict.playtimeRegistered.replace("{hours}", String(hours))
  // En figuras y libros (cómics y mangas incluidos) la serie y el tomo son el
  // dato que sitúa la pieza; en un juego se omite porque ya lo cuenta el título.
  const series = kindSupportsSeries(game.kind) && game.series
    ? kindSupportsVolume(game.kind) && game.volume != null
      ? `${game.series} #${game.volume}`
      : game.series
    : null
  const meta = [
    hasReleaseYear && game.releaseYear != null ? game.releaseYear : null,
    hasReleaseYear ? game.publisher : null,
    kindSupportsDeveloper(game.kind) ? game.developer : null,
    series,
    kindSupportsGenre(game.kind)
      ? genreNames(game.genres, lang).join(", ") ||
        conditionLabel(game.condition, dict.conditions)
      : hasReleaseYear
        ? conditionLabel(game.condition, dict.conditions)
        : null,
    playtime,
  ]
    .filter(Boolean)
    .join(" • ")

  return (
    <article className={list ? "game-card game-card--list" : "game-card"}>
      <div className="game-card__cover">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={game.title} className="game-card__cover-image" />
        ) : (
          <div className="game-card__cover-placeholder">
            <KindIcon aria-hidden="true" />
          </div>
        )}
        <span className="game-card__scrim" aria-hidden="true" />

        <span
          className={`game-card__status game-card__status--${STATUS_TONES[game.status]}`}
        >
          {isDigital ? (
            <span className="game-card__status-dot" aria-hidden="true" />
          ) : (
            <StatusIcon aria-hidden="true" />
          )}
          {dict.statuses[game.status]}
        </span>

        <span className="game-card__format">
          {isDigital ? dict.digitalFormat : dict.physicalFormat}
        </span>

        <GameCardActions game={game} dict={dict} lang={lang} />
      </div>

      <div className="game-card__body">
        <div className="game-card__main">
          <div className="game-card__row">
            {kindSupportsPlatform(game.kind) && game.platform && (
              <span className="game-card__platform">
                <Gamepad2 aria-hidden="true" />
                {game.platform}
              </span>
            )}
            {hours != null && hours > 0 && (
              <span className="game-card__playtime">
                <Clock aria-hidden="true" />
                {hours} {dict.playtime}
              </span>
            )}
            {game.rating != null && (
              <RatingStars
                value={game.rating}
                label={ratingLabel(dict.ratingValue, game.rating)}
                className="game-card__rating"
              />
            )}
          </div>
          <h2 className="game-card__title">
            <Link href={`/${lang}/app/games/${game.id}`}>{game.title}</Link>
          </h2>
          {meta !== "" && <p className="game-card__meta">{meta}</p>}
        </div>

        <div className="game-card__footer">
          <div className="game-card__value">
            <span className="game-card__value-label">{dict.estimatedValue}</span>
            <span className="game-card__value-amount">{formatPrice(game.purchasePrice)}</span>
          </div>
          <Link
            href={`/${lang}/app/games/${game.id}`}
            className="game-card__detail"
          >
            {dict.viewDetails}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}

