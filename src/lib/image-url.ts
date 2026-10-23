/**
 * Validación de URLs de imagen (portada y galería). Es la misma en el servidor y
 * en el formulario de edición: además de http(s) se admiten las subidas locales
 * (`/uploads/...`). Cualquier otro esquema (`javascript:`, `data:`, `vbscript:`)
 * o una URL relativa a otro host (`//evil`) se rechaza.
 */
export function isValidImageUrl(value: string): boolean {
  if (value.startsWith("/uploads/")) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}
