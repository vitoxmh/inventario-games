export type PlatformOption = {
  id: string
  name: string
  slug: string
}

export function normalizePlatform(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export function slugifyPlatform(name: string): string {
  return normalizePlatform(name).replace(/\s+/g, "-") || "plataforma"
}

export function resolvePlatformId(
  platforms: PlatformOption[],
  rawgName: string,
): string | null {
  const needle = normalizePlatform(rawgName)
  if (!needle) return null

  const exact = platforms.find(
    (p) => normalizePlatform(p.name) === needle,
  )
  if (exact) return exact.id

  const fallback = platforms.find(
    (p) =>
      normalizePlatform(p.name) === "otra" ||
      normalizePlatform(p.name) === "other",
  )
  return fallback?.id ?? null
}