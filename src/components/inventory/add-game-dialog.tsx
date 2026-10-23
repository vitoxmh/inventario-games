"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Plus, Search, Gamepad2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { resolvePlatformId, type PlatformOption } from "@/lib/platforms"
import { genreName, type GenreOption } from "@/lib/genres"
import { CollectionKind, GameStatus } from "@/generated/prisma/enums"
import {
  COLLECTION_KINDS,
  DEFAULT_KIND,
  isCollectionKind,
  kindRequiresPlatform,
  kindSupportsDeveloper,
  kindSupportsGenre,
  kindSupportsSeries,
  kindSupportsVolume,
  type CollectionKindKey,
} from "@/lib/kinds"
import { GenreChips } from "@/components/inventory/genre-chips"
import type { Locale } from "@/lib/i18n/locales"
import type { Dictionary } from "@/messages/es"

type InventoryDict = Dictionary["inventory"]
type StatusKey = keyof typeof GameStatus

const STATUS_KEYS = Object.keys(GameStatus) as StatusKey[]
type RawgSummary = {
  id: number
  title: string
  coverImageUrl: string | null
  platform: string
  platformId: string | null
  genre: string | null
  playtimeMin: number
}

export function AddGameDialog({
  dict,
  platforms,
  genres,
  lang,
  triggerClassName,
  triggerLabel,
}: {
  dict: InventoryDict
  platforms: PlatformOption[]
  genres: GenreOption[]
  lang: Locale
  // El mismo diálogo se usa como CTA de la barra superior de QuestVault y como
  // botón secundario dentro de las páginas, así que el disparador es
  // configurable en clase y etiqueta.
  triggerClassName?: string
  triggerLabel?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<RawgSummary[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [addingId, setAddingId] = useState<number | null>(null)
  const [manualKind, setManualKind] = useState<CollectionKindKey>(DEFAULT_KIND)
  const [manualTitle, setManualTitle] = useState("")
  const [manualPlatformId, setManualPlatformId] = useState(
    platforms[0]?.id ?? "",
  )
  const [addingManual, setAddingManual] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualDeveloper, setManualDeveloper] = useState("")
  const [manualPublisher, setManualPublisher] = useState("")
  const [manualSeries, setManualSeries] = useState("")
  const [manualVolume, setManualVolume] = useState("")
  const [manualGenreIds, setManualGenreIds] = useState<string[]>([])
  // Una sola opción, igual que el estado del formulario de edición: el
  // desplegable es de elección única y arranca en el mismo valor que ponía el
  // `@default(OWNED)` del schema cuando el campo todavía no existía.
  const [manualStatus, setManualStatus] = useState<StatusKey>(
    GameStatus.OWNED,
  )

  // Géneros marcados en el alta manual, en el mismo orden del listado para que
  // los chips salgan igual que las opciones del desplegable.
  const manualGenres = manualGenreIds.flatMap((id) => {
    const found = genres.find((genre) => genre.id === id)
    return found ? [found] : []
  })

  const manualFields = dict.kindFields[manualKind]
  const manualNeedsPlatform = kindRequiresPlatform(manualKind)
  const manualSupportsSeries = kindSupportsSeries(manualKind)
  const manualSupportsVolume = kindSupportsVolume(manualKind)
  const manualHasGenre = kindSupportsGenre(manualKind)
  const manualHasDeveloper = kindSupportsDeveloper(manualKind)

  function removeManualGenre(id: string) {
    setManualGenreIds((prev) => prev.filter((current) => current !== id))
  }

  function handleSearch() {
    const q = query.trim()
    if (q.length < 3) {
      setResults(null)
      setNotice(dict.minQuery)
      return
    }
    setNotice(null)
    startSearch(async () => {
      const res = await fetch(`/api/rawg/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        setNotice(dict.searchingError)
        return
      }
      const data = (await res.json()) as { results: RawgSummary[] }
      const withPlatform = data.results.map((game) => ({
        ...game,
        platformId: resolvePlatformId(platforms, game.platform),
      }))
      setResults(withPlatform)
      if (withPlatform.length === 0) setNotice(dict.noResults)
      else if (withPlatform.some((game) => game.platformId === null)) {
        setNotice(dict.platformNotAvailable)
      }
    })
  }

  async function handleAdd(game: RawgSummary) {
    if (!game.platformId) return
    setAddingId(game.id)
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: CollectionKind.GAME,
        rawgId: game.id,
        title: game.title,
        platformId: game.platformId,
        genre: game.genre,
        coverImageUrl: game.coverImageUrl,
        playtimeMin: game.playtimeMin,
      }),
    })
    setAddingId(null)

    if (res.status === 403) {
      setNotice(dict.limitReached)
      return
    }
    if (!res.ok) {
      setNotice(dict.errorAdd)
      return
    }

    setOpen(false)
    setQuery("")
    setResults(null)
    toast.success(dict.addedToast)
    router.refresh()
  }

  async function handleManualAdd() {
    const title = manualTitle.trim().slice(0, 200)
    const platformId = manualNeedsPlatform ? manualPlatformId : ""
    if (!title || (manualNeedsPlatform && !platformId)) {
      setManualError(
        !title ? dict.errorTitleRequired : dict.errorPlatformRequired,
      )
      return
    }

    // El tomo solo se envía en los libros; en el resto va como null para no
    // arrastrar datos de un cambio de tipo.
    let volume: number | null = null
    if (manualSupportsVolume && manualVolume.trim() !== "") {
      const parsed = Number(manualVolume.trim())
      if (!Number.isInteger(parsed) || parsed < 0) {
        setManualError(dict.errorVolumeInvalid)
        return
      }
      volume = parsed
    }
    setManualError(null)
    setAddingManual(true)
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: manualKind,
        title,
        ...(platformId ? { platformId } : {}),
        genreIds: manualHasGenre ? manualGenreIds : [],
        developer: manualHasDeveloper ? manualDeveloper.trim() || null : null,
        publisher: manualPublisher.trim() || null,
        series: manualSupportsSeries ? manualSeries.trim() || null : null,
        volume: manualSupportsVolume ? volume : null,
        status: manualStatus,
      }),
    })
    setAddingManual(false)

    if (res.status === 403) {
      setNotice(dict.limitReached)
      return
    }
    if (!res.ok) {
      setNotice(dict.errorAdd)
      return
    }

    setOpen(false)
    setQuery("")
    setResults(null)
    setManualTitle("")
    setManualKind(DEFAULT_KIND)
    setManualPlatformId(platforms[0]?.id ?? "")
    setManualDeveloper("")
    setManualPublisher("")
    setManualSeries("")
    setManualVolume("")
    setManualGenreIds([])
    setManualStatus(GameStatus.OWNED)
    toast.success(dict.addedToast)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
        setOpen(next)
        if (!next) setManualError(null)
      }}>
      <DialogTrigger render={<Button className={triggerClassName} />}>
        <Plus aria-hidden="true" />
        {triggerLabel ?? dict.add}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{dict.modalTitle}</DialogTitle>
          <DialogDescription>{dict.modalDescription}</DialogDescription>
        </DialogHeader>

        {manualKind === CollectionKind.GAME && (
          <>
        <div className="game-picker__search">
          <Label htmlFor="game-search" className="u-sr-only">
            {dict.searchPlaceholder}
          </Label>
          <Input
            id="game-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleSearch()
              }
            }}
            placeholder={dict.searchPlaceholder}
            autoComplete="off"
          />
          <Button
            type="button"
            onClick={handleSearch}
            disabled={searching || query.trim().length < 3}
          >
            {searching ? (
              <span className="game-picker__spinner">
                {dict.searching}
              </span>
            ) : (
              <>
                <Search aria-hidden="true" />
                {dict.search}
              </>
            )}
          </Button>
        </div>

        {notice && (
          <p className="game-picker__notice">{notice}</p>
        )}

        <div className="game-picker__results">
          {results === null && searching && (
            <>
              <Skeleton className="game-picker__result" />
              <Skeleton className="game-picker__result" />
            </>
          )}
          {results?.map((game) => (
            <div
              key={game.id}
              className="game-picker__result"
            >
              {game.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.coverImageUrl}
                  alt=""
                  className="game-picker__cover"
                />
              ) : (
                <div className="game-picker__cover game-picker__cover--empty">
                  <Gamepad2 aria-hidden="true" />
                </div>
              )}
              <div className="game-picker__info">
                <p className="game-picker__name">{game.title}</p>
                <p className="game-picker__meta">
                  {game.platform || dict.unknownPlatform}
                  {game.genre ? ` · ${game.genre}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => handleAdd(game)}
                disabled={addingId === game.id || !game.platformId}
                title={!game.platformId ? dict.platformNotAvailable : undefined}
              >
                {addingId === game.id ? (
                  dict.adding
                ) : (
                  <>
                    <Plus aria-hidden="true" />
                    {dict.add}
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
          </>
        )}

        <div className="game-picker__manual">
          <p className="game-picker__manual-title">{dict.manualAdd}</p>
          <div className="game-picker__manual-body">
            <div className="game-picker__manual-grid">
              <Label htmlFor="manual-kind" className="u-sr-only">
                {dict.kindLabel}
              </Label>
              <span className="u-flex u-gap-2">
                <Select
                  value={manualKind}
                  onValueChange={(value) => {
                    if (value != null && isCollectionKind(value)) {
                      setManualKind(value)
                      setManualError(null)
                    }
                  }}
                  itemToStringLabel={(value) =>
                    value != null
                      ? dict.kinds[value as CollectionKindKey] ?? String(value)
                      : ""
                  }
                >
                  <SelectTrigger
                    id="manual-kind"
                    className="select__trigger--block"
                    aria-label={dict.kindLabel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLLECTION_KINDS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {dict.kinds[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
              <Label htmlFor="manual-title" className="u-sr-only">
                {dict.manualTitleLabel}
              </Label>
              <Input
                id="manual-title"
                value={manualTitle}
                onChange={(event) => {
                  setManualTitle(event.target.value)
                  if (manualError) setManualError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleManualAdd()
                  }
                }}
                maxLength={200}
                placeholder={dict.titlePlaceholder}
                aria-invalid={manualError === dict.errorTitleRequired ? true : undefined}
                autoComplete="off"
              />
              {manualNeedsPlatform && (
                <>
              <Label htmlFor="manual-platform" className="u-sr-only">
                {dict.manualPlatformLabel}
              </Label>
              <span className="u-flex u-gap-2">
                <Select
                  value={manualPlatformId}
                  onValueChange={(value) => {
                    if (value != null) setManualPlatformId(value)
                    if (value) setManualError(null)
                  }}
                  itemToStringLabel={(value) =>
                    platforms.find((p) => p.id === value)?.name ?? ""
                  }
                >
                  <SelectTrigger
                    id="manual-platform"
                    className="select__trigger--block"
                    aria-label={dict.manualPlatformLabel}
                    aria-invalid={
                      manualError === dict.errorPlatformRequired ? true : undefined
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((platform) => (
                      <SelectItem key={platform.id} value={platform.id}>
                        {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
                </>
              )}
              <Label htmlFor="manual-status" className="u-sr-only">
                {dict.statusLabel}
              </Label>
              <span className="u-flex u-gap-2">
                <Select
                  value={manualStatus}
                  onValueChange={(value) => {
                    if (value != null) setManualStatus(value as StatusKey)
                  }}
                  itemToStringLabel={(value) =>
                    value != null
                      ? dict.statuses[value as StatusKey] ?? String(value)
                      : ""
                  }
                >
                  <SelectTrigger
                    id="manual-status"
                    className="select__trigger--block"
                    aria-label={dict.statusLabel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {dict.statuses[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
              {manualHasGenre && (
                <>
              <Label htmlFor="manual-genre" className="u-sr-only">
                {dict.genre}
              </Label>
              <span className="u-flex u-gap-2">
                <Select
                  multiple
                  value={manualGenreIds}
                  onValueChange={(value) => {
                    setManualGenreIds(value)
                    if (value.length > 0) setManualError(null)
                  }}
                  itemToStringLabel={(value) => {
                    const found = genres.find((genre) => genre.id === value)
                    return found ? genreName(found, lang) : ""
                  }}
                >
                  <SelectTrigger
                    id="manual-genre"
                    className="select__trigger--block"
                    aria-label={dict.genre}
                  >
                    <SelectValue placeholder={dict.genrePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {genres.map((genre) => (
                      <SelectItem key={genre.id} value={genre.id}>
                        {genreName(genre, lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
              <div className="game-picker__genres">
                <GenreChips
                  genres={manualGenres}
                  lang={lang}
                  removeLabel={dict.removeGenre}
                  onRemove={removeManualGenre}
                />
              </div>
                </>
              )}
              {manualHasDeveloper && (
                <>
              <Label htmlFor="manual-developer" className="u-sr-only">
                {manualFields.developer}
              </Label>
              <Input
                id="manual-developer"
                value={manualDeveloper}
                onChange={(event) =>
                  setManualDeveloper(event.target.value.slice(0, 160))
                }
                maxLength={160}
                placeholder={manualFields.developer}
                aria-label={manualFields.developer}
                autoComplete="off"
              />
                </>
              )}
              <Label htmlFor="manual-publisher" className="u-sr-only">
                {manualFields.publisher}
              </Label>
              <Input
                id="manual-publisher"
                value={manualPublisher}
                onChange={(event) =>
                  setManualPublisher(event.target.value.slice(0, 160))
                }
                maxLength={160}
                placeholder={manualFields.publisher}
                aria-label={manualFields.publisher}
                autoComplete="off"
              />
              {manualSupportsSeries && (
                <Input
                  id="manual-series"
                  value={manualSeries}
                  onChange={(event) =>
                    setManualSeries(event.target.value.slice(0, 160))
                  }
                  maxLength={160}
                  placeholder={dict.seriesPlaceholder}
                  aria-label={dict.series}
                  autoComplete="off"
                />
              )}
              {manualSupportsVolume && (
                <Input
                  id="manual-volume"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={manualVolume}
                  onChange={(event) =>
                    setManualVolume(event.target.value.slice(0, 5))
                  }
                  placeholder={dict.volumePlaceholder}
                  aria-label={dict.volume}
                  autoComplete="off"
                />
              )}
            </div>
            {manualError && (
              <p className="field-error">{manualError}</p>
            )}
            <Button
              type="button"
              size="sm"
              className="u-fit"
              onClick={() => void handleManualAdd()}
              disabled={addingManual}
            >
              {addingManual ? (
                dict.adding
              ) : (
                <>
                  <Plus aria-hidden="true" />
                  {dict.add}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}