/*
 * Unión de class names para las clases BEM.
 *
 * Antes esto venía del paquete `cn` (un clon de `clsx` + `tailwind-merge`).
 * Con SASS/BEM no hay utilidades que fusionar: una clase BEM no "pisa" a otra,
 * así que solo hace falta concatenar y descartar lo vacío. Se mantiene el
 * nombre `cn` para no tocar los ~60 archivos que lo importan.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: unknown };

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  for (const value of values) {
    if (!value && value !== 0) continue;

    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      continue;
    }

    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
      continue;
    }

    if (typeof value === "object") {
      for (const key in value) {
        if (value[key]) out.push(key);
      }
    }
  }

  return out.join(" ");
}

/**
 * Props de un primitivo de Base UI con `className` restringido a texto.
 *
 * Base UI admite que `className` sea una función del estado del componente
 * (`(state) => classes`). Nuestros wrappers no lo soportan: el estado ya se
 * pinta con selectores de atributo (`[data-open]`, `[aria-invalid]`,
 * `[data-slot]`), así que las clases BEM no dependen de JavaScript. Con este
 * tipo la API pública del wrapper es `className?: string` y `cn()` recibe
 * siempre texto.
 */
export type UiProps<T> = Omit<T, "className"> & { className?: string };
