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

export type RawgGameSummary = {
  id: number
  title: string
  coverImageUrl: string | null
  platform: string
  genre: string | null
  playtimeMin: number
  released: string | null
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