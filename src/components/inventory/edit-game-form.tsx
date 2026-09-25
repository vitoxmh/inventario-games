"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowLeft, CloudUpload, ImageUp, Plus, Save, Star, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GameStatus } from "@/generated/prisma/enums"
import type { PlatformOption } from "@/lib/platforms"
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"
import type { GameSummary } from "@/lib/game-summary"

type InventoryDict = Dictionary["inventory"]
type StatusKey = keyof typeof GameStatus

type FieldErrors = Partial<
  Record<
    | "title"
    | "platformId"
    | "genre"
    | "status"
    | "condition"
    | "hours"
    | "price"
    | "date",
    string
  >
>

const STATUS_KEYS = Object.keys(GameStatus) as StatusKey[]

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024

export function EditGameForm({
  game,
  dict,
  lang,
  canCustomCover,
  maxImages,
  platforms,
}: {
  game: GameSummary
  dict: InventoryDict
  lang: Locale
  canCustomCover: boolean
  maxImages: number
  platforms: PlatformOption[]
}) {
  const router = useRouter()
  const dropInputRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState(game.title)
  const [platformId, setPlatformId] = useState(game.platformId)
  const [genre, setGenre] = useState(game.genre ?? "")
  const [status, setStatus] = useState<StatusKey>(game.status)
  const [condition, setCondition] = useState(game.condition ?? "")
  const [hours, setHours] = useState(
    game.playtimeMin != null ? String(game.playtimeMin / 60) : "",
  )
  const [price, setPrice] = useState(
    game.purchasePrice != null ? String(game.purchasePrice) : "",
  )
  const [date, setDate] = useState(game.purchaseDate?.slice(0, 10) ?? "")
  const [notes, setNotes] = useState(game.notes ?? "")
  const [images, setImages] = useState<string[]>(game.images)
  const [errors, setErrors] = useState<FieldErrors>({})

  const detailHref = `/${lang}/app/games/${game.id}`

  function maxImagesLabel() {
    return dict.maxImages.replace("{max}", String(maxImages))
  }

  function setImage(index: number, value: string) {
    setImages((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  function addImage() {
    setImages((prev) => (prev.length < maxImages ? [...prev, ""] : prev))
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  function setAsMain(index: number) {
    setImages((prev) => {
      if (index <= 0) return prev
      const main = prev[index]
      if (main === undefined) return prev
      return [main, ...prev.filter((item, i) => i !== index)]
    })
  }

  function isValidImageUrl(value: string) {
    if (value.startsWith("/uploads/")) return true
    try {
      const parsed = new URL(value)
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  function save() {
    const nextErrors: FieldErrors = {}

    const cleanTitle = title.trim().slice(0, 200)
    if (!cleanTitle) nextErrors.title = dict.errorTitleRequired

    if (!platformId) nextErrors.platformId = dict.errorPlatformRequired

    const cleanGenre = genre.trim().slice(0, 120)
    if (!cleanGenre) nextErrors.genre = dict.errorGenreRequired

    const cleanCondition = condition.trim().slice(0, 60)
    if (!cleanCondition) nextErrors.condition = dict.errorConditionRequired

    let playtimeMin: number | null = null
    const trimmedHours = hours.trim()
    if (trimmedHours === "") {
      nextErrors.hours = dict.errorHoursRequired
    } else {
      const parsed = Number(trimmedHours)
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextErrors.hours = dict.errorHoursInvalid
      } else {
        playtimeMin = Math.round(parsed * 60)
      }
    }

    let parsedPrice: number | null = null
    const trimmedPrice = price.trim()
    if (trimmedPrice === "") {
      nextErrors.price = dict.errorPriceRequired
    } else {
      const parsed = Number(trimmedPrice)
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextErrors.price = dict.errorPriceInvalid
      } else {
        parsedPrice = Math.round(parsed * 100) / 100
      }
    }

    let cleanDate: string | null = null
    const trimmedDate = date.trim()
    if (trimmedDate !== "") {
      const parsed = new Date(trimmedDate)
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== trimmedDate
      ) {
        nextErrors.date = dict.errorDateInvalid
      } else {
        cleanDate = trimmedDate
      }
    }

    setErrors(nextErrors)
    if (
      nextErrors.title ||
      nextErrors.platformId ||
      nextErrors.genre ||
      nextErrors.condition ||
      nextErrors.hours ||
      nextErrors.price ||
      nextErrors.date
    ) {
      return
    }

    const cleanImages = canCustomCover
      ? images.map((item) => item.trim()).filter((item) => item !== "")
      : []
    if (cleanImages.length > maxImages) {
      toast.error(maxImagesLabel())
      return
    }
    if (cleanImages.some((item) => !isValidImageUrl(item))) {
      toast.error(dict.coverInvalidUrl)
      return
    }

    startTransition(async () => {
      const res = await fetch(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          platformId,
          genre: cleanGenre || null,
          status,
          playtimeMin,
          condition: cleanCondition || null,
          purchasePrice: parsedPrice,
          purchaseDate: cleanDate,
          notes: notes.trim().slice(0, 2000) || null,
          ...(canCustomCover ? { images: cleanImages } : {}),
        }),
      })
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        toast.error(
          errData?.error === "max_images"
            ? maxImagesLabel()
            : dict.errorUpdate,
        )
        return
      }
      toast.success(dict.savedToast)
      router.push(detailHref)
      router.refresh()
    })
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    if (files.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
      toast.error(dict.coverInvalidType)
      return
    }
    if (files.some((file) => file.size > MAX_IMAGE_FILE_SIZE)) {
      toast.error(dict.coverFileTooLarge)
      return
    }

    const filled = images.filter((url) => url.trim() !== "").length
    const remaining = Math.max(0, maxImages - filled)
    const batch = files.slice(0, remaining)
    if (batch.length === 0) {
      toast.error(maxImagesLabel())
      return
    }

    setUploading(true)
    try {
      for (const file of batch) {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch(`/api/games/upload`, {
          method: "POST",
          body: form,
        })
        if (!res.ok) {
          toast.error(dict.coverUploadError)
          continue
        }
        const data = (await res.json()) as { url: string }
        setImages((prev) => {
          const index = prev.findIndex((url) => url.trim() === "")
          if (index >= 0) {
            const next = [...prev]
            next[index] = data.url
            return next
          }
          return prev.length < maxImages ? [...prev, data.url] : prev
        })
      }
    } catch {
      toast.error(dict.coverUploadError)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={detailHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {dict.backToGame}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{dict.editTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{game.title}</p>
      </div>

      <div className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-title-${game.id}`}>{dict.titleLabel}</Label>
            <Input
              id={`edit-title-${game.id}`}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }))
              }}
              maxLength={200}
              placeholder={dict.titlePlaceholder}
              aria-invalid={errors.title ? true : undefined}
              autoComplete="off"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-platform-${game.id}`}>{dict.platform}</Label>
            <Select
              value={platformId}
              onValueChange={(value) => {
                if (value != null) setPlatformId(value)
                if (value) setErrors((prev) => ({ ...prev, platformId: undefined }))
              }}
              itemToStringLabel={(value) =>
                platforms.find((p) => p.id === value)?.name ?? ""
              }
            >
              <SelectTrigger
                id={`edit-platform-${game.id}`}
                className="w-full"
                aria-invalid={errors.platformId ? true : undefined}
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
            {errors.platformId && (
              <p className="text-sm text-destructive">{errors.platformId}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-genre-${game.id}`}>{dict.genre}</Label>
            <Input
              id={`edit-genre-${game.id}`}
              value={genre}
              onChange={(event) => {
                setGenre(event.target.value.slice(0, 120))
                if (errors.genre) setErrors((prev) => ({ ...prev, genre: undefined }))
              }}
              maxLength={120}
              placeholder={dict.genrePlaceholder}
              aria-invalid={errors.genre ? true : undefined}
              autoComplete="off"
            />
            {errors.genre && (
              <p className="text-sm text-destructive">{errors.genre}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-status-${game.id}`}>{dict.statusLabel}</Label>
            <Select
              value={status}
              onValueChange={(value) => value != null && setStatus(value as StatusKey)}
              itemToStringLabel={(value) => value != null ? dict.statuses[value as StatusKey] ?? String(value) : ""}
            >
              <SelectTrigger id={`edit-status-${game.id}`}>
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
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-condition-${game.id}`}>{dict.condition}</Label>
            <Input
              id={`edit-condition-${game.id}`}
              value={condition}
              onChange={(event) => {
                setCondition(event.target.value.slice(0, 60))
                if (errors.condition) setErrors((prev) => ({ ...prev, condition: undefined }))
              }}
              maxLength={60}
              placeholder={dict.conditionPlaceholder}
              aria-invalid={errors.condition ? true : undefined}
              autoComplete="off"
            />
            {errors.condition && (
              <p className="text-sm text-destructive">{errors.condition}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-hours-${game.id}`}>{dict.playtimeLabel}</Label>
            <Input
              id={`edit-hours-${game.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={hours}
              onChange={(event) => {
                setHours(event.target.value.slice(0, 7))
                if (errors.hours) setErrors((prev) => ({ ...prev, hours: undefined }))
              }}
              placeholder={dict.hoursPlaceholder}
              aria-invalid={errors.hours ? true : undefined}
            />
            {errors.hours && (
              <p className="text-sm text-destructive">{errors.hours}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-price-${game.id}`}>{dict.purchasePrice}</Label>
            <Input
              id={`edit-price-${game.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              max="999999.99"
              step="0.01"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value.slice(0, 12))
                if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }))
              }}
              placeholder={dict.pricePlaceholder}
              aria-invalid={errors.price ? true : undefined}
            />
            {errors.price && (
              <p className="text-sm text-destructive">{errors.price}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-date-${game.id}`}>{dict.purchaseDate}</Label>
            <Input
              id={`edit-date-${game.id}`}
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value)
                if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }))
              }}
              aria-invalid={errors.date ? true : undefined}
            />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`edit-notes-${game.id}`}>{dict.notes}</Label>
          <Textarea
            id={`edit-notes-${game.id}`}
            rows={4}
            maxLength={2000}
            value={notes}
            placeholder={dict.notesPlaceholder}
            onChange={(event) => setNotes(event.target.value.slice(0, 2000))}
          />
        </div>

        {canCustomCover ? (
          <div className="flex flex-col gap-2">
            <Label>{dict.customCover}</Label>
            <p className="text-xs text-muted-foreground">
              {maxImagesLabel()}
              {images.length > 0 ? ` · ${dict.mainImageHint}` : ""}
            </p>
            <div className="flex flex-col gap-2">
              {images.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt=""
                      className="size-12 shrink-0 rounded border object-cover"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                      <ImageUp className="size-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Input
                      id={`photo-url-${game.id}-${index}`}
                      type="url"
                      value={url}
                      onChange={(event) =>
                        setImage(index, event.target.value.slice(0, 1000))
                      }
                      maxLength={1000}
                      placeholder={dict.coverUrlPlaceholder}
                      autoComplete="off"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAsMain(index)}
                        aria-label={dict.makeMain}
                        aria-pressed={index === 0}
                        title={dict.makeMain}
                        className={cn(
                          "text-muted-foreground",
                          index === 0 && "text-amber-500",
                        )}
                      >
                        <Star
                          className={cn("size-4", index === 0 && "fill-current")}
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeImage(index)}
                        className="text-muted-foreground"
                      >
                        <Trash2 aria-hidden="true" />
                        {dict.removeImage}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {images.length < maxImages && (
                <>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={dict.dragDropPhotos}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground outline-none transition-colors hover:border-ring/70 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                      dragActive && "border-ring bg-accent/60 text-foreground",
                    )}
                    onClick={() => dropInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        dropInputRef.current?.click()
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragActive(true)
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setDragActive(false)
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragActive(false)
                      void handleFiles(event.dataTransfer.files)
                    }}
                  >
                    <CloudUpload
                      className={cn("size-6", uploading && "animate-pulse")}
                      aria-hidden="true"
                    />
                    <span>
                      {uploading ? dict.uploading : dict.dragDropPhotos}
                    </span>
                    <span className="text-xs">{maxImagesLabel()}</span>
                  </div>
                  <input
                    ref={dropInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files) void handleFiles(event.target.files)
                      event.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addImage}
                    disabled={uploading}
                    className="w-fit"
                  >
                    <Plus aria-hidden="true" />
                    {dict.addImage}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {dict.coverProOnly}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={pending || uploading}
            className="inline-flex items-center gap-1.5"
          >
            <Save className="size-4" aria-hidden="true" />
            {dict.save}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(detailHref)}
            disabled={pending}
          >
            <X aria-hidden="true" />
            {dict.cancel}
          </Button>
        </div>
      </div>
    </div>
  )
}