"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowLeft, CloudUpload, ImageUp, Plus, Save, Star, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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
import { CollectionKind, GameStatus } from "@/generated/prisma/enums"
import {
  COLLECTION_KINDS,
  MAX_RELEASE_YEAR,
  MIN_RELEASE_YEAR,
  isCollectionKind,
  isValidReleaseYear,
  kindRequiresPlatform,
  kindSupportsDeveloper,
  kindSupportsGenre,
  kindSupportsParts,
  kindSupportsPlatform,
  kindSupportsPlaytime,
  kindSupportsReleaseYear,
  kindSupportsSeries,
  kindSupportsVolume,
  type CollectionKindKey,
} from "@/lib/kinds"
import { isValidImageUrl } from "@/lib/image-url"
import type { PlatformOption } from "@/lib/platforms"
import { genreName, type GenreOption } from "@/lib/genres"
import {
  CONDITION_VALUES,
  conditionKeyOf,
  conditionLabel,
  type ConditionKey,
} from "@/lib/conditions"
import {
  isPhysicalStatus,
  missingParts,
  presentParts,
  type PartsKey,
} from "@/lib/game-parts"
import { GenreChips } from "@/components/inventory/genre-chips"
import { PartsPicker } from "@/components/inventory/parts-picker"
import type { Dictionary } from "@/messages/es"
import type { Locale } from "@/lib/i18n/locales"
import type { GameSummary } from "@/lib/game-summary"
import { RatingInput } from "@/components/inventory/rating"
import { ratingLabel } from "@/lib/rating"

type InventoryDict = Dictionary["inventory"]
type StatusKey = keyof typeof GameStatus

// El estado físico es un desplegable con la escalera cerrada, no un texto: no
// tiene error de validación porque siempre hay una opción marcada.
type FieldErrors = Partial<
  Record<
    "title" | "platformId" | "status" | "hours" | "price" | "volume" | "releaseYear",
    string
  >
>

const STATUS_KEYS = Object.keys(GameStatus) as StatusKey[]

// Base UI no acepta `""` como valor de un `SelectItem` (lo trata como "sin
// selección"), así que la opción de vaciar la plataforma usa un centinela que
// nunca puede ser el id de una fila.
const NO_PLATFORM = "__none__"

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
  genres,
}: {
  game: GameSummary
  dict: InventoryDict
  lang: Locale
  canCustomCover: boolean
  maxImages: number
  platforms: PlatformOption[]
  genres: GenreOption[]
}) {
  const router = useRouter()
  const dropInputRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState(game.title)
  const [kind, setKind] = useState<CollectionKindKey>(game.kind)
  const [platformId, setPlatformId] = useState(game.platformId ?? "")
  // Los géneros del juego. Es una lista porque un juego puede encajar en varios a
  // la vez; el desplegable permite marcar y desmarcar, y los chips de abajo son
  // los que se pueden quitar uno a uno. Vacío = sin género (dato opcional).
  const [genreIds, setGenreIds] = useState<string[]>(() =>
    game.genres.map((genre) => genre.id),
  )
  const [developer, setDeveloper] = useState(game.developer ?? "")
  const [publisher, setPublisher] = useState(game.publisher ?? "")
  const [series, setSeries] = useState(game.series ?? "")
  const [volume, setVolume] = useState(
    game.volume != null ? String(game.volume) : "",
  )
  const [releaseYear, setReleaseYear] = useState(
    game.releaseYear != null ? String(game.releaseYear) : "",
  )
  const [rating, setRating] = useState<number | null>(game.rating)
  const [status, setStatus] = useState<StatusKey>(game.status)
  const [condition, setCondition] = useState<ConditionKey>(
    conditionKeyOf(game.condition),
  )
  // Qué piezas tiene la copia, y el estado decide si el campo se ve: en un juego
  // digital o en la lista de deseos no hay caja ni manual que marcar. Se pueden
  // marcar varias (son tres pastillas); lo que se guarda es el complemento, porque
  // `Game.parts` son las piezas que FALTAN.
  //
  // El `?? []` evita que un payload RSC servido antes de que existiera el campo
  // (la caché de rutas del cliente, un prefetch) reviente el render: aquí la
  // lista se recorre sin más, y el servidor la valida igual cuando se guarda.
  const [parts, setParts] = useState<PartsKey[]>(presentParts(game.parts))
  const [hours, setHours] = useState(
    game.playtimeMin != null ? String(game.playtimeMin / 60) : "",
  )
  const [price, setPrice] = useState(
    game.purchasePrice != null ? String(game.purchasePrice) : "",
  )
  const [notes, setNotes] = useState(game.notes ?? "")
  const [images, setImages] = useState<string[]>(game.images)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Los ids seleccionados, traducidos a filas del listado para los chips. Se
  // cruzan contra `genres` (y no al revés) para no inventarse una etiqueta si el
  // admin borró el género entre la carga de la página y el clic.
  const selectedGenres = genreIds.flatMap((id) => {
    const found = genres.find((genre) => genre.id === id)
    return found ? [found] : []
  })

  const isPhysical = isPhysicalStatus(status)
  const needsPlatform = kindRequiresPlatform(kind)
  const hasPlaytime = kindSupportsPlaytime(kind)
  const hasParts = kindSupportsParts(kind)
  const hasSeries = kindSupportsSeries(kind)
  const hasVolume = kindSupportsVolume(kind)
  const hasReleaseYear = kindSupportsReleaseYear(kind)
  const hasGenre = kindSupportsGenre(kind)
  const hasDeveloper = kindSupportsDeveloper(kind)
  // La plataforma se exige en los juegos y se ofrece opcional en el resto salvo
  // en las figuras, que no pertenecen a ninguna.
  const hasPlatform = needsPlatform || kindSupportsPlatform(kind)
  const fields = dict.kindFields[kind]
  const titleLabel =
    kind === CollectionKind.CONSOLE
      ? dict.consoleTitleLabel
      : dict.titleLabel

  const detailHref = `/${lang}/app/games/${game.id}`

  function removeGenre(id: string) {
    setGenreIds((prev) => prev.filter((current) => current !== id))
  }

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

  function save() {
    const nextErrors: FieldErrors = {}

    const cleanTitle = title.trim().slice(0, 200)
    if (!cleanTitle) nextErrors.title = dict.errorTitleRequired

    if (needsPlatform && !platformId) {
      nextErrors.platformId = dict.errorPlatformRequired
    }

    // El tiempo jugado solo tiene sentido en videojuegos: en el resto el campo
    // no se muestra y se guarda como `null` para no arrastrar horas de antes de
    // cambiar el tipo.
    let playtimeMin: number | null = null
    if (hasPlaytime) {
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
    }

    // El precio es obligatorio en juegos (comportamiento de siempre) y opcional
    // en accesorios, figuras, libros y cómics, donde muchas veces no se recuerda.
    let parsedPrice: number | null = null
    const trimmedPrice = price.trim()
    if (trimmedPrice === "") {
      if (kind === CollectionKind.GAME) {
        nextErrors.price = dict.errorPriceRequired
      }
    } else {
      const parsed = Number(trimmedPrice)
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextErrors.price = dict.errorPriceInvalid
      } else {
        parsedPrice = Math.round(parsed * 100) / 100
      }
    }

    // El tomo solo existe en libros (cómics y mangas incluidos); en el resto se
    // manda como null para no arrastrar valores de antes de cambiar el tipo.
    let parsedVolume: number | null = null
    if (hasVolume && volume.trim() !== "") {
      const parsed = Number(volume.trim())
      if (!Number.isInteger(parsed) || parsed < 0) {
        nextErrors.volume = dict.errorVolumeInvalid
      } else {
        parsedVolume = parsed
      }
    }

    // El año solo existe en consolas; en el resto se manda como null.
    let parsedReleaseYear: number | null = null
    if (hasReleaseYear && releaseYear.trim() !== "") {
      const parsed = Number(releaseYear.trim())
      if (!isValidReleaseYear(parsed)) {
        nextErrors.releaseYear = dict.errorReleaseYearInvalid
      } else {
        parsedReleaseYear = parsed
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

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
          kind,
          // Los campos que el tipo no usa se mandan vacíos para no arrastrar
          // datos de antes de cambiar el tipo (p. ej. una figura que era juego).
          platformId: hasPlatform ? platformId || null : null,
          // El conjunto se reemplaza entero: `[]` deja el juego sin género.
          genreIds: hasGenre ? genreIds : [],
          developer: hasDeveloper
            ? developer.trim().slice(0, 160) || null
            : null,
          publisher: publisher.trim().slice(0, 160) || null,
          series: hasSeries ? series.trim().slice(0, 160) || null : null,
          volume: hasVolume ? parsedVolume : null,
          releaseYear: hasReleaseYear ? parsedReleaseYear : null,
          rating,
          status,
          playtimeMin,
          // Clave de la escalera de `src/lib/conditions.ts` (la etiqueta la pone
          // el dict al pintar), no texto libre.
          condition,
          // Solo se manda si el estado es físico: en digital o en deseos el
          // selector no está en pantalla y omitir el campo deja el valor guardado
          // como está (así volver a ponerlo en físico lo recupera). El estado del
          // formulario son las piezas que TIENE, así que se manda el complemento
          // (`missingParts`), que es lo que espera la BD, ya validado y en el
          // orden de lectura de `GAME_PARTS_VALUES`.
          ...(isPhysical && hasParts ? { parts: missingParts(parts) } : {}),
          purchasePrice: parsedPrice,
          // La fecha de compra ya no se edita en el formulario, así que no se
          // manda: el PATCH solo toca los campos que llegan y el valor guardado
          // se queda como está.
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
    <div className="game-form">
      <Link
        href={detailHref}
        className="game-form__back"
      >
        <ArrowLeft aria-hidden="true" />
        {dict.backToGame}
      </Link>

      <div>
        <h1 className="game-form__title">{dict.editTitle}</h1>
        <p className="game-form__subtitle">{game.title}</p>
      </div>

      <div className="game-form__box">
        <div className="game-form__grid">
          <div className="game-form__field">
            <Label htmlFor={`edit-kind-${game.id}`}>{dict.kindLabel}</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                if (value != null && isCollectionKind(value)) {
                  setKind(value)
                  // Al volver a "juego" el selector ya no ofrece "sin
                  // plataforma"; si estaba vacía se elige la primera para no
                  // dejar el control mostrando un valor que no existe.
                  if (kindRequiresPlatform(value) && !platformId) {
                    setPlatformId(platforms[0]?.id ?? "")
                  }
                  setErrors((prev) => ({ ...prev, platformId: undefined }))
                }
              }}
              itemToStringLabel={(value) =>
                value != null
                  ? dict.kinds[value as CollectionKindKey] ?? String(value)
                  : ""
              }
            >
              <SelectTrigger
                id={`edit-kind-${game.id}`}
                className="select__trigger--block"
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
          </div>
          <div className="game-form__field">
            <Label htmlFor={`edit-title-${game.id}`}>{titleLabel}</Label>
            <Input
              id={`edit-title-${game.id}`}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }))
              }}
              maxLength={200}
              placeholder={
                kind === CollectionKind.CONSOLE
                  ? dict.consoleTitlePlaceholder
                  : dict.titlePlaceholder
              }
              aria-invalid={errors.title ? true : undefined}
              autoComplete="off"
            />
            {errors.title && (
              <p className="field-error">{errors.title}</p>
            )}
          </div>
          {hasPlatform && (
          <div className="game-form__field">
            <Label htmlFor={`edit-platform-${game.id}`}>{fields.platform}</Label>
            <Select
              value={platformId || NO_PLATFORM}
              onValueChange={(value) => {
                if (value != null) {
                  setPlatformId(value === NO_PLATFORM ? "" : value)
                  if (value !== NO_PLATFORM) {
                    setErrors((prev) => ({ ...prev, platformId: undefined }))
                  }
                }
              }}
              itemToStringLabel={(value) =>
                value === NO_PLATFORM
                  ? dict.noPlatform
                  : platforms.find((p) => p.id === value)?.name ?? ""
              }
            >
              <SelectTrigger
                id={`edit-platform-${game.id}`}
                aria-invalid={errors.platformId ? true : undefined}
                className="select__trigger--block"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!needsPlatform && (
                  <SelectItem value={NO_PLATFORM}>{dict.noPlatform}</SelectItem>
                )}
                {platforms.map((platform) => (
                  <SelectItem key={platform.id} value={platform.id}>
                    {platform.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.platformId && (
              <p className="field-error">{errors.platformId}</p>
            )}
          </div>
          )}
          {hasGenre && (
          <div className="game-form__field">
            <Label htmlFor={`edit-genre-${game.id}`}>{dict.genre}</Label>
            <Select
              multiple
              value={genreIds}
              onValueChange={(value) => setGenreIds(value)}
              itemToStringLabel={(value) => {
                const found = genres.find((genre) => genre.id === value)
                return found ? genreName(found, lang) : String(value)
              }}
            >
              <SelectTrigger
                id={`edit-genre-${game.id}`}
                className="select__trigger--block"
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
            <GenreChips
              genres={selectedGenres}
              lang={lang}
              removeLabel={dict.removeGenre}
              onRemove={removeGenre}
            />
          </div>
          )}
          {hasDeveloper && (
          <div className="game-form__field">
            <Label htmlFor={`edit-developer-${game.id}`}>{fields.developer}</Label>
            <Input
              id={`edit-developer-${game.id}`}
              value={developer}
              onChange={(event) =>
                setDeveloper(event.target.value.slice(0, 160))
              }
              maxLength={160}
              placeholder={fields.developer}
              autoComplete="off"
            />
          </div>
          )}
          <div className="game-form__field">
            <Label htmlFor={`edit-publisher-${game.id}`}>{fields.publisher}</Label>
            <Input
              id={`edit-publisher-${game.id}`}
              value={publisher}
              onChange={(event) =>
                setPublisher(event.target.value.slice(0, 160))
              }
              maxLength={160}
              placeholder={fields.publisher}
              autoComplete="off"
            />
          </div>
          {hasSeries && (
            <div className="game-form__field">
              <Label htmlFor={`edit-series-${game.id}`}>{dict.series}</Label>
              <Input
                id={`edit-series-${game.id}`}
                value={series}
                onChange={(event) =>
                  setSeries(event.target.value.slice(0, 160))
                }
                maxLength={160}
                placeholder={dict.seriesPlaceholder}
                autoComplete="off"
              />
            </div>
          )}
          {hasVolume && (
              <div className="game-form__field">
                <Label htmlFor={`edit-volume-${game.id}`}>{dict.volume}</Label>
                <Input
                  id={`edit-volume-${game.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={volume}
                  onChange={(event) => {
                    setVolume(event.target.value.slice(0, 5))
                    if (errors.volume) {
                      setErrors((prev) => ({ ...prev, volume: undefined }))
                    }
                  }}
                  placeholder={dict.volumePlaceholder}
                  aria-invalid={errors.volume ? true : undefined}
                />
                {errors.volume && (
                  <p className="field-error">{errors.volume}</p>
                )}
              </div>
          )}
          {hasReleaseYear && (
            <div className="game-form__field">
              <Label htmlFor={`edit-release-year-${game.id}`}>
                {dict.releaseYear}
              </Label>
              <Input
                id={`edit-release-year-${game.id}`}
                type="number"
                inputMode="numeric"
                min={MIN_RELEASE_YEAR}
                max={MAX_RELEASE_YEAR}
                step="1"
                value={releaseYear}
                onChange={(event) => {
                  setReleaseYear(event.target.value.slice(0, 4))
                  if (errors.releaseYear) {
                    setErrors((prev) => ({ ...prev, releaseYear: undefined }))
                  }
                }}
                placeholder={dict.releaseYearPlaceholder}
                aria-invalid={errors.releaseYear ? true : undefined}
              />
              {errors.releaseYear && (
                <p className="field-error">{errors.releaseYear}</p>
              )}
            </div>
          )}
          <div className="game-form__field">
            <Label htmlFor={`edit-status-${game.id}`}>{dict.statusLabel}</Label>
            <Select
              value={status}
              onValueChange={(value) => value != null && setStatus(value as StatusKey)}
              itemToStringLabel={(value) => value != null ? dict.statuses[value as StatusKey] ?? String(value) : ""}
            >
              <SelectTrigger
                id={`edit-status-${game.id}`}
                className="select__trigger--block"
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
          </div>
          <div className="game-form__field">
            <Label htmlFor={`edit-condition-${game.id}`}>{dict.condition}</Label>
            <Select
              value={condition}
              onValueChange={(value) => value != null && setCondition(value as ConditionKey)}
              itemToStringLabel={(value) =>
                conditionLabel(value, dict.conditions) ?? ""
              }
            >
              <SelectTrigger
                id={`edit-condition-${game.id}`}
                className="select__trigger--block"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_VALUES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {dict.conditions[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Solo en copias físicas: una copia digital no tiene caja ni manual que
              le falten, y un juego deseado todavía no está en la estantería. La
              condición física no se filtra con esto porque es un dato de todas las
              copias. */}
          {isPhysical && hasParts && (
            <div className="game-form__field">
              {/* Sin `htmlFor`: el grupo de casillas no es un control etiquetable
                  (son tres), y cada baldosa lleva su propia etiqueta. */}
              <p className="label">{dict.partsLabel}</p>
              <PartsPicker
                id={`edit-parts-${game.id}`}
                value={parts}
                labels={dict.parts}
                onChange={setParts}
              />
              <p className="field-hint">{dict.partsHint}</p>
            </div>
          )}
          <div className="game-form__field">
            {/* No es un `<Label>` con `htmlFor`: el selector de estrellas es un
                `radiogroup`, no un control etiquetable, y el grupo ya lleva su
                propio `aria-label`. Ocupa la fila entera para que la explicación
                de debajo tenga sitio y el formulario cierre las parejas. */}
            <p className="label">{dict.rating}</p>
            <RatingInput
              value={rating}
              onChange={setRating}
              label={dict.rating}
              optionLabel={(step) => ratingLabel(dict.ratingOption, step)}
              clearLabel={dict.clearRating}
            />
            <p className="field-hint">{dict.ratingHint}</p>
          </div>
          {hasPlaytime && (
            <div className="game-form__field">
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
                <p className="field-error">{errors.hours}</p>
              )}
            </div>
          )}
          <div className="game-form__field">
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
              <p className="field-error">{errors.price}</p>
            )}
          </div>
        </div>

        <div className="game-form__field">
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
          <div className="game-form__field">
            <Label>{dict.customCover}</Label>
            <p className="game-form__subtitle">
              {maxImagesLabel()}
              {images.length > 0 ? ` · ${dict.mainImageHint}` : ""}
            </p>
            <div className="game-form__field">
              {images.map((url, index) => (
                <div key={index} className="game-form__photo">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt=""
                      className="game-form__thumb"
                    />
                  ) : (
                    <div className="game-form__thumb game-form__thumb--empty">
                      <ImageUp aria-hidden="true" />
                    </div>
                  )}
                  <div className="game-form__photo-body">
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
                    <div className="game-form__photo-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAsMain(index)}
                        aria-label={dict.makeMain}
                        aria-pressed={index === 0}
                        title={dict.makeMain}
                        className={cn("photo-star", index === 0 && "photo-star--on")}
                      >
                        <Star
                          className={cn(index === 0 && "fill-current")}
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeImage(index)}
                        className="photo-action"
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
                      dragActive && "game-form__drop--active",
                      uploading && "game-form__drop--uploading",
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
                    <CloudUpload aria-hidden="true" />
                    <span>
                      {uploading ? dict.uploading : dict.dragDropPhotos}
                    </span>
                    <span className="game-form__drop-note">{maxImagesLabel()}</span>
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
                    className="u-fit"
                  >
                    <Plus aria-hidden="true" />
                    {dict.addImage}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="game-form__locked">
            {dict.coverProOnly}
          </p>
        )}

        <div className="game-form__actions">
          <Button
            type="button"
            onClick={save}
            disabled={pending || uploading}
          >
            <Save className="u-icon" aria-hidden="true" />
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
