import "server-only"

const RAWG_BASE = "https://api.rawg.io/api"
const CACHE_SECONDS = 60 * 60 * 24

type RawgGameResponse = {
  id: number
  name: string
  background_image: string | null
  released: string | null
  playtime: number
  genres?: { name: string }[]
  platforms?: { platform: { name: string } }[]
  parent_platforms?: { platform: { name: string } }[]
}

// El endpoint de BÚSQUEDA (`/games`) no incluye los créditos: vienen en el
// detalle de cada juego (`/games/{id}`). Por eso se piden aparte, y solo para el
// juego que el usuario va a añadir y no para los 40 resultados de la lista.
type RawgGameDetailResponse = {
  id: number
  developers?: { name: string }[]
  publishers?: { name: string }[]
}

export type RawgGameSummary = {
  id: number
  title: string
  coverImageUrl: string | null
  platform: string
  genre: string | null
  playtimeMin: number
  released: string | null
}

export type RawgGameCredits = {
  developer: string | null
  publisher: string | null
}

function pickPrimaryPlatform(result: RawgGameResponse): string {
  const parents = result.parent_platforms ?? []
  if (parents.length > 0) return parents[0]?.platform?.name ?? ""
  return result.platforms?.[0]?.platform?.name ?? ""
}

export async function searchRawgGames(query: string): Promise<RawgGameSummary[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const apiKey = process.env.RAWG_API_KEY
  if (!apiKey) return []

  const url = `${RAWG_BASE}/games?search=${encodeURIComponent(q)}&page_size=40&search_precise=true`

  const res = await fetch(`${url}&key=${apiKey}`, {
    next: { revalidate: CACHE_SECONDS },
  })
  if (!res.ok) {
    console.error("[rawg] error en búsqueda:", res.status)
    return []
  }

  const data: { results?: RawgGameResponse[] } = await res.json()
  return (data.results ?? []).map((result) => ({
    id: result.id,
    title: result.name,
    coverImageUrl: result.background_image ?? null,
    platform: pickPrimaryPlatform(result),
    genre: result.genres?.[0]?.name ?? null,
    playtimeMin: (result.playtime ?? 0) * 60,
    released: result.released ?? null,
  }))
}

// Developer y publisher del juego, para precargar los campos al añadirlo desde
// el catálogo. Nunca lanza: si la API falla o no hay clave, se devuelven `null`
// y el alta sigue adelante con esos campos vacíos (el usuario los puede escribir
// después en la ficha), porque perder un crédito no puede impedir dar de alta un
// juego que sí se ha encontrado.
export async function fetchRawgGameCredits(id: number): Promise<RawgGameCredits> {
  const empty: RawgGameCredits = { developer: null, publisher: null }

  const apiKey = process.env.RAWG_API_KEY
  if (!apiKey) return empty

  try {
    const res = await fetch(`${RAWG_BASE}/games/${id}?key=${apiKey}`, {
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) {
      console.error("[rawg] error en detalle:", res.status)
      return empty
    }

    const data = (await res.json()) as RawgGameDetailResponse
    return {
      developer: data.developers?.[0]?.name?.trim() || null,
      publisher: data.publishers?.[0]?.name?.trim() || null,
    }
  } catch (error) {
    console.error("[rawg] error inesperado en detalle:", error)
    return empty
  }
}