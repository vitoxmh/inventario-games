"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Command, Search } from "lucide-react"
import { RatingStars } from "@/components/inventory/rating"
import { ratingLabel } from "@/lib/rating"
import { KIND_ICONS, type CollectionKindKey } from "@/lib/kinds"
import { cn } from "@/lib/utils"
import type { Locale } from "@/lib/i18n/locales"

type SearchDict = {
  placeholder: string
  label: string
  searching: string
  noResults: string
  searchError: string
}

type GameHit = {
  id: string
  title: string
  kind: CollectionKindKey
  coverImageUrl: string | null
  status: string
  rating: number | null
  platform: string | null
}

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 220

/**
 * Buscador global de la barra superior.
 *
 * Busca en los juegos del propio usuario (no en el catálogo de RAWG): es el
 * atajo para saltar a un juego concreto de la colección, así que la lista
 * aparece mientras se escribe y cada resultado lleva a su ficha.
 *
 * Es un Client Component porque consulta por `fetch` con retardo, mueve el foco
 * con el teclado y gestiona el desplegable. El `⌘K` del diseño se implementa
 * de verdad: enfoca el campo en lugar de ser decorativo.
 */
export function TopbarSearch({
  locale,
  dict,
  statusLabels,
  ratingValueTemplate,
}: {
  locale: Locale
  dict: SearchDict
  statusLabels: Record<string, string>
  ratingValueTemplate: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GameHit[] | null>(null)
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Guarda la última respuesta servida: al teclear rápido las peticiones salen
  // desordenadas, y sin esto un "hel" lento puede pisar los resultados de una
  // búsqueda más reciente.
  const requestId = useRef(0)

  const q = query.trim()

  useEffect(() => {
    // Por debajo del mínimo no se busca nada, y el estado se limpia al teclear
    // (en `onChange`) en vez de aquí: un `setState` síncrono en el cuerpo del
    // efecto cascada un render que no aporta nada.
    if (q.length < MIN_QUERY_LENGTH) return

    const id = requestId.current + 1
    requestId.current = id

    const timer = setTimeout(async () => {
      setSearching(true)
      setError(false)
      try {
        const res = await fetch(
          `/api/games/search?q=${encodeURIComponent(q)}`,
        )
        if (!res.ok) throw new Error("search_failed")
        const data = (await res.json()) as { results: GameHit[] }
        if (requestId.current !== id) return
        setResults(data.results)
        setActive(0)
        setOpen(true)
      } catch {
        if (requestId.current !== id) return
        setResults([])
        setError(true)
        setOpen(true)
      } finally {
        if (requestId.current === id) setSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [q])

  // Cierra el desplegable al pulsar fuera, sin secuestrar los clics que empiezan
  // dentro (por ejemplo al seleccionar texto del campo).
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const focus = useCallback(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // El `⌘K` del diseño, ahora funcional. Se escucha en `keydown` porque
  // `metaKey` no llega por `onKeyDown` del input cuando el foco está fuera.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      focus()
      setOpen(true)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [focus])

  function go(game: GameHit) {
    setOpen(false)
    setQuery("")
    router.push(`/${locale}/app/games/${game.id}`)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results || results.length === 0) return
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => (current + step + results.length) % results.length)
      return
    }
    if (event.key === "Enter") {
      const picked = results?.[active]
      if (picked) {
        event.preventDefault()
        go(picked)
      }
    }
  }

  const showPanel = open && q.length >= MIN_QUERY_LENGTH
  const emptyMessage = searching
    ? dict.searching
    : error
      ? dict.searchError
      : dict.noResults

  return (
    <div className="topbar__search" ref={rootRef}>
      <div className="topbar__search-field">
        <Search className="topbar__search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className="topbar__search-input"
          placeholder={dict.placeholder}
          aria-label={dict.label}
          value={query}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="topbar-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(event) => {
            const value = event.target.value
            setQuery(value)
            if (value.trim().length < MIN_QUERY_LENGTH) {
              // Se anula la búsqueda en curso y se cierra el panel, en vez de
              // esperar a que el efecto limpie: si no, los resultados de la
              // consulta anterior se quedan a la vista con el campo vacío.
              requestId.current += 1
              setResults(null)
              setSearching(false)
              setError(false)
              setOpen(false)
            }
          }}
          onFocus={() => q.length >= MIN_QUERY_LENGTH && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className="topbar__search-kbd">
          <Command className="topbar__search-kbd-icon" aria-hidden="true" />
          K
        </kbd>
      </div>

      {showPanel && (
        <div
          className="search-panel"
          role="listbox"
          id="topbar-search-results"
          aria-label={dict.label}
        >
          {searching || error || (results?.length ?? 0) === 0 ? (
            <p className="search-panel__empty" role="status">
              {emptyMessage}
            </p>
          ) : (
            <ul className="search-panel__list">
              {results!.map((game, index) => {
                const KindIcon = KIND_ICONS[game.kind]
                return (
                <li key={game.id}>
                  <Link
                    href={`/${locale}/app/games/${game.id}`}
                    className={cn(
                      "search-panel__item",
                      index === active && "search-panel__item--active",
                    )}
                    role="option"
                    aria-selected={index === active}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => {
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    {game.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={game.coverImageUrl}
                        alt=""
                        className="search-panel__cover"
                      />
                    ) : (
                      <span className="search-panel__cover search-panel__cover--empty">
                        <KindIcon aria-hidden="true" />
                      </span>
                    )}

                    <span className="search-panel__text">
                      <span className="search-panel__title">{game.title}</span>
                      <span className="search-panel__meta">
                        {statusLabels[game.status] ?? game.status}
                        {game.platform ? ` · ${game.platform}` : ""}
                      </span>
                    </span>

                    {game.rating != null && (
                      <RatingStars
                        value={game.rating}
                        label={ratingLabel(ratingValueTemplate, game.rating)}
                      />
                    )}
                  </Link>
                </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
