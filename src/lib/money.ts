/*
 * Reglas de dinero compartidas entre servidor y cliente.
 *
 * Existe como módulo aparte de `billing.ts`/`mp.ts` porque esos dos son
 * `server-only` (tienen el SDK de MP y el de Stripe dentro) y el panel de admin
 * necesita EXACTAMENTE la misma lógica para previsualizar el precio que se está
 * tecleando. Una copia de la tabla de monedas sin decimales en un componente
 * cliente divergiría de la del checkout en cuanto nadie actualice las dos.
 *
 * Regla: los importes se guardan y se transportan SIEMPRE en unidades menores
 * (minor units). Multiplicar por 100 es responsabilidad del formateador, que es
 * el único que sabe cuántos decimales tiene la moneda.
 */

/**
 * Monedas sin parte decimal. En ellas el proveedor rechaza el importe con
 * decimales: con CLP, mandar `9990.00` devuelve 400 `property_value` ("does not
 * match pattern") en `total_amount` y en `items[0].unit_price`; hay que mandar
 * `9990`.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "UYW",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
])

/** Si la moneda usa decimales. Todo lo que no esté en la tabla usa 2. */
export function currencyHasDecimals(currency: string | null | undefined) {
  return currency ? !ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) : true
}

/**
 * Importe en unidades mayores a partir del entero en unidades menores, con los
 * decimales que admite la moneda. `null` si no hay moneda o el entero no vale.
 *
 * Es la inversa de lo que espera la API: el entero es lo que se guarda y lo que
 * se manda, esto es solo para pintar.
 */
export function minorToMajor(
  minor: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (currency == null) return null
  if (typeof minor !== "number" || !Number.isInteger(minor) || minor < 0) {
    return null
  }
  return currencyHasDecimals(currency)
    ? (minor / 100).toFixed(2)
    : String(minor)
}

/**
 * Importe de un plan tal como lo espera la API del proveedor, a partir del
 * entero que hay en la fila `Plan` (`mpPriceMinor`).
 *
 * El NÚMERO sale de la BD, nunca de `MP_PRICE_*` ni del cliente. Se formatea con
 * los decimales que la moneda permite porque en las de cero decimales un `9990.00`
 * es un 400 de la API, no un redondeo.
 */
export function formatMinorAmount(
  minor: number,
  currency: string | null | undefined,
): string | null {
  if (currency == null) return null
  if (!Number.isInteger(minor) || minor <= 0) return null
  return minorToMajor(minor, currency)
}

/** `4.99` en USD, con el símbolo y el separador que pida el locale. */
export function formatUsdMinor(
  minor: number | null | undefined,
  locale: "es" | "en" = "en",
): string | null {
  if (typeof minor !== "number" || !Number.isInteger(minor) || minor < 0) {
    return null
  }
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-ES", {
    style: "currency",
    currency: "USD",
  }).format(minor / 100)
}

/**
 * Importe en unidades MENORES de CUALQUIER moneda, con su símbolo y sus
 * decimales: `999` → `9,99 US$`, `9990` en CLP → `$9.990`.
 *
 * Los decimales los pone `Intl` a partir del código ISO (CLP, JPY y el resto de
 * las de cero decimales salen sin parte decimal sin que haya que mirar la tabla
 * de arriba), pero el número que se le pasa es SIEMPRE el mayor: por eso se
 * convierte con `minorToMajor` y no se divide a mano, que es justo el bug de
 * `$99.90` en una moneda sin decimales.
 *
 * El código se valida antes porque `Intl` lanza `RangeError` con cualquier cosa
 * que no sean tres letras, y la moneda viene de la fila guardada por el
 * proveedor (o de una fila tocada a mano): un historial no puede tumbar la página
 * por un dato feo, se salta ese importe.
 */
export function formatMinorCurrency(
  minor: number | null | undefined,
  currency: string | null | undefined,
  locale: "es" | "en" = "es",
): string | null {
  const code = currency?.trim().toUpperCase()
  if (!code || !/^[A-Z]{3}$/.test(code)) return null
  const major = minorToMajor(minor, code)
  if (major == null) return null
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-ES", {
      style: "currency",
      currency: code,
    }).format(Number(major))
  } catch {
    return null
  }
}
