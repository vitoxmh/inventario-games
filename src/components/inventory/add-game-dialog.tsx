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
import type { Dictionary } from "@/messages/es"

type InventoryDict = Dictionary["inventory"]
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
}: {
  dict: InventoryDict
  platforms: PlatformOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<RawgSummary[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [addingId, setAddingId] = useState<number | null>(null)
  const [manualTitle, setManualTitle] = useState("")
  const [manualPlatformId, setManualPlatformId] = useState(
    platforms[0]?.id ?? "",
  )
  const [addingManual, setAddingManual] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

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
    const platformId = manualPlatformId
    if (!title || !platformId) {
      setManualError(!title ? dict.errorTitleRequired : dict.errorPlatformRequired)
      return
    }
    setManualError(null)
    setAddingManual(true)
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, platformId }),
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
    setManualPlatformId(platforms[0]?.id ?? "")
    toast.success(dict.addedToast)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
        setOpen(next)
        if (!next) setManualError(null)
      }}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        {dict.add}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{dict.modalTitle}</DialogTitle>
          <DialogDescription>{dict.modalDescription}</DialogDescription>
        </DialogHeader>

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

        <div className="game-picker__manual">
          <p className="game-picker__manual-title">{dict.manualAdd}</p>
          <div className="game-picker__manual-body">
            <div className="game-picker__manual-grid">
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