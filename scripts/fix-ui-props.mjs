/*
 * Ajuste mecánico de los tipos de props de los wrappers de Base UI.
 *
 * Los wrappers que reciben `className` lo declaraban con el tipo del primitivo
 * de Base UI, que admite `string | ((state) => string)`. Como nuestros bloques
 * BEM se resuelven con texto, el tipo correcto es `UiProps<...>`.
 *
 * Uso: node scripts/fix-ui-props.mjs [--check]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const DIR = "src/components/ui"
const check = process.argv.includes("--check")

const LEADING_TYPE =
  /^(\s*)([A-Za-z][A-Za-z0-9]*Primitive(?:\.[A-Za-z]+)*\.Props)(?![\w<])/

let changed = 0

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".tsx"))) {
  const path = join(DIR, file)
  const source = readFileSync(path, "utf8")
  let out = source
  let touched = false

  let cursor = 0
  for (;;) {
    const fn = out.indexOf("function ", cursor)
    if (fn === -1) break
    const paren = out.indexOf("(", fn)
    if (paren === -1) break

    let depth = 0
    let end = paren
    for (; end < out.length; end++) {
      const ch = out[end]
      if (ch === "(" || ch === "{" || ch === "[") depth++
      else if (ch === ")" || ch === "}" || ch === "]") {
        depth--
        if (depth === 0 && ch === ")") break
      }
    }
    if (depth !== 0) break

    const params = out.slice(paren, end + 1)
    if (params.includes("className")) {
      // El tipo va tras los parámetros desestructurados: el primer `:` que no
      // está dentro de llaves, corchetes o paréntesis.
      let d = 0
      let colon = -1
      for (let i = 1; i < params.length; i++) {
        const ch = params[i]
        if (ch === "{" || ch === "[" || ch === "(") d++
        else if (ch === "}" || ch === "]" || ch === ")") d--
        else if (ch === ":" && d === 0) {
          colon = i
          break
        }
      }
      if (colon !== -1) {
        const typeStart = paren + colon + 1
        const typeText = params.slice(colon + 1, -1)
        const match = LEADING_TYPE.exec(typeText)
        if (match && !/UiProps</.test(typeText)) {
          const insertAt = typeStart + match[1].length
          out =
            out.slice(0, insertAt) +
            `UiProps<${match[2]}>` +
            out.slice(insertAt + match[2].length)
          touched = true
          changed++
          cursor = insertAt + match[2].length + 9
          continue
        }
      }
    }
    cursor = end + 1
  }

  if (touched) {
    if (
      !/import\s*\{[^}]*\bUiProps\b[^}]*\}\s*from\s*["']@\/lib\/utils["']/.test(out)
    ) {
      const replaced = out.replace(
        /import\s*\{\s*cn\s*\}\s*from\s*(["']@\/lib\/utils["'])/,
        (_m, mod) => `import { cn, type UiProps } from ${mod}`,
      )
      if (replaced === out) {
        throw new Error(`${file}: falta importar cn desde @/lib/utils`)
      }
      out = replaced
    }
    if (!check) writeFileSync(path, out, "utf8")
  }
}

console.log(`${check ? "would wrap" : "wrapped"} ${changed} props types`)
