export type PlatformOption = {
  id: string
  name: string
  slug: string
}

/**
 * Plataformas en orden alfabético, que es como las ve el usuario en los
 * desplegables. No se usa `orderBy: { name: "asc" }` de Postgres porque su
 * collation pone las minúsculas al final ("Xbox" antes que "iOS"): el nombre
 * tiene un solo idioma, así que ordenar en JS con `sensitivity: "base"` da el
 * mismo resultado en las dos versiones de la app.
 *
 * `Array.prototype.sort` es estable, así que a igualdad de nombre se respeta el
 * orden de entrada.
 */
export function sortPlatforms<T extends PlatformOption>(platforms: T[]): T[] {
  return [...platforms].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
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