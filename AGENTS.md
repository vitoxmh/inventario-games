<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Proyecto: Iven (GameVault)

SaaS de inventario para coleccionistas de videojuegos. Repo pequeño, monorepo-ish dentro de `D:\app\iven`. Todo el código de la app vive en `src/`. **NO hay** `middleware.ts`: se usa `proxy.ts` (Next 16) con export `proxy` + `config.matcher`.

## Stack (versiones reales instaladas — NO asumas otras)

| Pieza | Versión | Notas |
|---|---|---|
| Next.js | 16.3.6 | Turbopack (dev), App Router, `proxy.ts` |
| React | 19.2.8 | — |
| Base UI | `@base-ui/react@1.8.0` | **OJO: APIs distintas a lo habitual** (ver abajo) |
| shadcn/ui | v4 wrappers sobre Base UI | salida en `src/components/ui/`, config `components.json` |
| Prisma | 7.10.0 | `provider = "prisma-client"` + **driver adapter** Neon |
| NextAuth | v5 beta (`next-auth@5.0.0-beta.32`) | sesión JWT, `trustHost: true` |
| DB | PostgreSQL en Neon | vía `@neondatabase/serverless` |
| Pagos | `stripe` + MercadoPago | implementación propia, ver `src/lib/{stripe,mp,payments,billing}.ts` |
| Storage | `@vercel/blob` | imágenes subidas (`/api/games/upload`); fallback filesystem `public/uploads/` solo en local |
| i18n | homemade (no next-intl) | ver sección i18n |
| UI libs | `lucide-react`, `sonner` (toasts), `next-themes`, `tailwindcss@4`, `tw-animate-css`, `class-variance-authority`, paquete **`cn`** (`import { cn } from "cn"`) |

## Comandos

```bash
npm run dev          # Next dev (Turbopack). El AGENTS.md se re-escribe con el bloque de arriba al compilar.
npm run build        # prisma generate + next build
npm start -- -p 3100 # servidor standalone de build (para E2E contra build real)
npm run lint         # eslint (sin args)
npm run db:generate  # prisma generate
npm run db:migrate / db:deploy / db:studio
npx prisma db execute --file <sql>   # OJO: Prisma 7 usa prisma7.config.ts; NO existe la flag --schema
```

Verificación: `npm run lint` + `npm run build`. El repo no tiene test runner.

## Variables de entorno (`.env` — no commitear; el repo no guarda secretos)

Nombres que el código lee (vía `process.env`):
- `DATABASE_URL` (Neon Postgres; el adapter hace pooling/SSL)
- `AUTH_SECRET` (firma del JWT de NextAuth)
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (opcionales; si falta la pareja, el provider Google se omite)
- `ADMIN_EMAILS` — lista separada por comas (case-insensitive). **Mecanismo de admin**: en cada login (`src/auth/config.ts` signIn) y en cada `requireAdmin()` (`src/lib/guard.ts` `promoteByEnv`), el usuario cuyo email esté en la lista es **promovido a `role: "admin"` automáticamente** el próximo request. Si no está poblada, nadie puede ser admin.
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (RAWG API) — usadas por `src/lib/rawg.ts` para buscar juegos al añadir (`/api/rawg/search`)
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`
- MercadoPago: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, credenciales del preapproval `MP_PREAPPROVAL_*`
- **`BLOB_READ_WRITE_TOKEN`** (Vercel Blob) — imágenes de portada/capturas subidas en `/api/games/upload`. En Vercel el filesystem es efímero y `public/` es inmutable en runtime: sin token las subidas fallan/caen; se usa el store de Blob (plan gratuito 5GB, sin tarjeta en Hobby). Sin la variable, en local hay fallback a `public/uploads/`.
- Email: `RESEND_API_KEY` (+ remitentes) para `src/lib/email.ts` (verificación de correo, alertas)
- `NODE_ENV`, `DATABASE_URL` para despliegue

Cambios en `.env` requieren reiniciar el dev server (las env se leen a arrancar o en el primer uso según archivo).

## Base UI 1.8.0 — APIs que NO son las esperadas (bugs ya ocurridos)

Verificado empíricamente contra `node_modules/@base-ui/react` (MenuItem, MenuCheckboxItem, useMenuItemCommonProps).

- **NO existe la prop `onSelect`** en items de menú. Es código muerto: el click solo cierra el menú, la acción jamás se dispara. Esto rompió "Editar/Eliminar/estados" y el logout.
- `MenuItem` → usa **`onClick`** y **`closeOnClick`** (default `true`). Si NO quieres que cierre al click, pon `closeOnClick={false}`.
- `MenuCheckboxItem` → usa **`onCheckedChange`** y **`closeOnClick`** (default `false`).
- `DropdownMenuItem` renderiza un `div`. **`render={<Link/>}` NO navega en esta versión** (el click cierra el menú vía `closeOnClick` pero el enlace jamás se dispara) y **`render={<button/>}` —sin `nativeButton`— dispara el warning de `useButton` y tampoco dispara la acción**. Para "Ver ficha"/"Editar"/navegar: item por defecto (div) + **`onClick={() => router.push(href)}`**; para logout: `render={<button type="button"/>}` + `onClick` (funciona). No anidar `<button>` dentro del item (HTML inválido + fallos).
- Los wrappers shadcn generan `data-slot="dropdown-menu-item"`, `"dropdown-menu-content"`, `"dialog-content"`, `"alert-dialog-content"`, `"dropdown-menu-checkbox-item"`, etc. — usables como selectores E2E.
- Diálogos (Dialog/AlertDialog) montan su contenido vía Portal+Presence tan solo al abrir. Estado visible no es `offsetParent` (los contenidos son `position: fixed` → offsetParent siempre `null`). Para comprobar apertura: presencia en DOM + `getBoundingClientRect()` con dimensiones + computed style.
- Menú de `<select>` Base UI (`SelectItem`, shadcn v4): **`SelectValue` muestra el VALOR crudo (`OWNED`, `all`, `newest`), no el label del item** — el item solo registra `label` si se le pasa la prop explícita (el "guess" del texto solo afecta a layout/typeahead, no al Value del store). Fix: prop **`itemToStringLabel={(value) => label...}`** en el `Select` (Root) de cada uso. Afectó a: select de estado del edit form (`src/components/inventory/edit-game-form.tsx`) y filtros/orden del grid (`inventory-grid.tsx`). Al tocar un select nuevo, NO asumir que Value traduce.

Convención UI: componentes en `src/components/ui/*` son wrappers finos de Base UI (botones con `buttonVariants({variant,size})`, `cva`). Al editar, mirar primero los wrappers existentes.

## Arquitectura y enrutado

```
src/
  proxy.ts                        # "middleware" Next 16: CSP+nonce, headers, redirect locale, guard /app
  app/
    [lang]/                       # segmento de idioma: page, layout, login, signup, pricing, app/{index,stats,billing,account,games/[id],games/[id]/edit}, admin/{users,games,subscriptions}, suspended, not-found
    api/
      auth/register, verify, resend-verification, [...nextauth]
      games + games/[id]          # CRUD del inventario del usuario (PATCH/POST/DELETE)
      games/upload                # subida de imágenes (Vercel Blob si hay token, si no filesystem local)
      rawg/search                 # busqueda de juegos (RAWG)
      admin/users, admin/users/[id], admin/games, admin/games/[id]
      billing/checkout, billing/portal
      stripe/webhook, mp/webhook
      health                       # GET /api/health (para health-checks E2E)
  auth/ index.ts (handlers) + config.ts (providers/callbacks)
  lib/   db, guard, admin-emails, auth(i18n helpers), plans, payments, billing, stripe, mp, rawg, email, rate-limit, utils, game-summary, i18n/{locales,get-dictionary}
  components/ site/* , auth/* , ui/* , inventory/* , billing/* , admin/*
  messages/ es.ts, en.ts          # diccionarios (JSON-like, tipados por Locale)
  generated/prisma/               # cliente generado (NO editar)
```

- Todos los paths de import usan alias `@/*` → `src/*`.
- Servicios de pago/mail: `src/lib/payments.ts` (estratos de pago, para usar checkout por lookup de planes), `src/lib/plans.ts` (planes FREE/PRO/COLLECTOR), `src/lib/billing.ts` (portal de cliente), `src/lib/stripe.ts`/`mp.ts` (clientes SDK configurados por env).

### Proxy / seguridad (`src/proxy.ts`)
- **CSP estricta con nonce** (`strict-dynamic`): se genera nonce por petición (crypto `randomBytes`) y se propaga como cabecera de request `x-nonce` (requisito de SSR dinámico de Next) + de respuesta. `'unsafe-eval'` solo en dev. `connect-src 'self'` (StripJS va por `frame-src`). Si algo de terceros necesita conectividad (webhooks client-side), hay que abrir la CSP intencionalmente.
- Cabeceras: nosniff, DENY frame, Referrer-Policy, Permissions-Policy, HSTS (solo https).
- Redirección de locale: paths sin `/es|/en` → se añade el detector por `accept-language` (default `es`).
- Guard de `/app/**`: valida JWT de NextAuth (`getToken` con `AUTH_SECRET`); sin sesión → `/login?callbackUrl=...`.
- `matcher` excluye `api|_next/static|_next/image|favicon.ico|.*\..*`.

### i18n
- Segmento `[lang]`; `src/lib/i18n/locales.ts` define `locales = ["es","en"]`, `defaultLocale = "es"`, `isLocale()`.
- `src/lib/i18n/get-dictionary.ts` carga `src/messages/{es,en}.ts`; los componentes reciben el diccionario por props (convención) o lo piden del layout. Tipos `Locale` se pasan como `params: { lang: Locale }`. Cambiar textos = editar los dos archivos de mensajes.

### Auth (NextAuth v5, JWT)
- Providers: credential (password, hash `bcryptjs`, requiere `emailVerifiedAt`, bloquea `bannedAt`) + Google opcional. En signIn Google: upsert sobre `user.email`, reutiliza cuenta existente.
- `jwt`/`session` callbacks: leen el usuario desde BD en cada request y refrescan `id/plan/role/banned` en el token/sesión (cambios de rol/baneo se reflejan al momento). Usuario externo actualizado no descarta la sesión.
- Baneo: `bannedAt` → deny en authorize y en `signIn`; `requireAdmin` también rechaza. Página `/suspended` para ese caso.
- `ADMIN_EMAILS` promueve admins en login/guard (ver sección env). En producción falta poner los emails reales.

### Prisma 7 (adaptador)
- `prisma/schema.prisma`: `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }` → el cliente se genera dentro de `src/` (imports `@/generated/prisma/client`). **Nunca editar `src/generated/prisma`**.
- `datasource` sin URL en schema: la URL viene de `process.env.DATABASE_URL` vía driver adapter con `PrismaNeon` (`@prisma/adapter-neon`) en `src/lib/db.ts`. Los enums se exportan desde `@/generated/prisma/enums`.
- `prisma7.config.ts` reemplaza a `prisma.config.ts`/flags CLI (usa `defineConfig`, `dotenv/config`, paths de schema y migrations).
- Modelos: `User`, `Platform`, `Game`, `GameImage`, `Account`, `Session`, `VerificationToken`. FKs de los modelos hijo con `onDelete: Cascade` → borrar un User vía SQL/`deleteMany` limpia sus juegos. Enums: `Plan` (FREE/PRO/COLLECTOR), `GameStatus` (OWNED/SEALED/CIB/LOOSE/DIGITAL/WISHLIST/SELLING), `SubscriptionStatus` (ACTIVE/INACTIVE/PAST_DUE/CANCELED/TRIALING). `Game` campos: title, **platformId** (FK → `Platform`, `onDelete: Restrict`), genre, status, condition, purchasePrice (Decimal), purchaseDate, notes, coverImageUrl, rawgId, playtimeMin; índices en userId/platformId/status. **Las plataformas NO son texto libre**: las define el admin en `/admin/platforms` (tabla `Platform` con `name`/`slug` únicos, `onDelete: Restrict` en Game) y el cliente solo selecciona. Helpers en `src/lib/platforms.ts` (client-safe): `normalizePlatform`, `slugifyPlatform`, `resolvePlatformId` (mapea nombre RAWG contra la lista; fallback a una plataforma llamada "Otra"/"Other"). Reescribir una migración a mano para backfill usa timestamp propio en `prisma/migrations/` + `prisma migrate deploy` (Prisma 7 no permite `migrate dev --create-only` no-interactivo con NOT NULL sin datos).
- Para tareas SQL directas usa `npx prisma db execute --file <sql>` (NO `--schema`, Prisma 7 no lo soporta). El prisma genera credenciales desde `.env`.

### Rate limiting
- `src/lib/rate-limit.ts`: fixed-window en memoria por IP (`x-forwarded-for`/`x-real-ip`). Registro/verificación usan `isRateLimitedRequest` con `prefix` y `limit`; la respuesta `429` viene de `rateLimitJsonResponse()` (Retry-After 900s). Es monojob: en despliegue serverless/horizontal habría que migrarlo a Upstash/Redis (comentado en el propio archivo).

## Bugs y lecciones ya corregidos (NO reincidir)

1. **`onSelect` en items Base UI no funciona** → usar `onClick` (MenuItem) / `onCheckedChange` (MenuCheckboxItem); ver más arriba. Afectaron: Editar/Eliminar/cambio de estado de `src/components/inventory/game-card-actions.tsx` y logout en `src/components/site/auth-nav.tsx` (`render={<button type="button" />}` + `onClick` → `signOut`).
2. **Diálogos dentro del popup del menú se desmontaban** al re-renderizar (el click para abrir cerraba el menú y con ello el dialog). Los diálogos se controlan con estado arriba (`editOpen`/`deleteOpen`) y viven **fuera** del `DropdownMenuContent`.
3. **`<button>` anidado**: el trigger del menú de la card se renderiza con `render={<Button .../>}` para no anidar `button` dentro de `button` (el trigger default es un `<button>`).
4. **.next corrupto / fuentes rotas tras reinstalar**: si el dev server no levanta o peta HMR, borrar `.next` y reiniciar. El CSS de fuentes va por `next/font` + `tw-animate-css`: no quitar los imports de fuente del layout.
5. **E2E con clicks sintéticos miente**: `.click()` programático dispara lógica distinta a un click de usuario real (en este repo llegó a "abrir" el dialog aunque el handler real estuviera roto). Para validar interactivos, emitir eventos de ratón reales (ej. Chrome headless + CDP `Input.dispatchMouseEvent` mousePressed/mouseReleased sobre el `getBoundingClientRect()` del item).
6. **Caché del navegador**: tras corregir un build roto, el usuario debe recargar con Ctrl+F5 (los bundles cacheados seguían rojos).
7. **`render={<Link/>}` en MenuItem no navega** (ver sección Base UI): cerrar el menú con `closeOnClick` + el anchor jamás dispara el SPA nav. Usar item div default + `onClick={() => router.push(href)}`. Verificado en "Ver ficha"/"Editar" de `game-card-actions.tsx`.
8. **`SelectValue` de Base UI muestra el valor crudo** (ver sección Base UI): cada `<Select>` con valores claveados necesita `itemToStringLabel`. El patrón `label={children}` en el wrapper NO funciona (el store no deriva label del texto del item).
9. **E2E headless: viewport pequeño rompe el hit-test**: con 800×600 el menú de la card hacía flip hacia arriba cortándose y `elementFromPoint` en las coords del item devolvía otro elemento → el click se perdía (pointerdown/up en targets distintos = sin evento `click`). Fix: `Emulation.setDeviceMetricsOverride` (1280×1000) antes de navegar.
10. **E2E: `ctrl+a` + `Input.insertText` no selecciona en inputs controlados** (hace append al valor existente). Para reemplazar valor en React: setter nativo del prototipo + `dispatchEvent(new Event('input', {bubbles:true}))`. Afectó al helper `setInputValue` de `e2e_ficha.mjs`.
11. **Subidas de imagen no funcionan en Vercel**: escribir en `public/uploads/` en runtime NO persiste (filesystem efímero de las funciones serverless; `/public` es inmutable fuera del build). Arreglado con **Vercel Blob** (`@vercel/blob`, `put` con `access:'public'` + `BLOB_READ_WRITE_TOKEN`, plan gratuito 5GB sin tarjeta en Hobby); el filesystem local queda solo como fallback sin token. Si un store de imágenes de terceros necesita `next/image` o CSP, hay que configurar `remotePatterns`/abrir CSP intencionalmente (aquí se usan `<img>` planos y `img-src https:` ya cubre el dominio de blob).
12. **NextAuth v5 en HTTPS: la cookie de sesión lleva el prefijo `__Secure-`** (`useSecureCookies` deriva de `url.protocol === "https:"`). `getToken()` por defecto busca `authjs.session-token` sin prefijo → en Vercel el guard de `/app` nunca veía la sesión y boteaba a `/login` pese a estar logueado. Fix: pasar `secureCookie: request.nextUrl.protocol === "https:"` en `src/proxy.ts`.
13. **Hydration mismatch por estado derivado del tema**: `next-themes` no conoce el tema en SSR (`resolvedTheme` = undefined → rama "light"), pero en el primer render del cliente ya tiene el valor real (localStorage/matchMedia) → atributos del DOM divergen ("A tree hydrated but some attributes... didn't match"). Ocurrió con el `aria-label` de `ThemeToggle` (`src/components/site/theme-toggle.tsx`). Fix idiomático: `suppressHydrationWarning` en el elemento (lo mismo que hace next-themes en `<html lang>`); el valor se autocorrige cuando el effect del provider refresca `resolvedTheme`. NO usar `setState` en un effect para un guard `mounted`: el lint `react-hooks/set-state-in-effect` lo rechaza. Reproducción/verificación de hydration: Chrome headless + CDP (`Emulation.setEmulatedMedia` prefers-color-scheme + capturar `Runtime.consoleAPICalled` error).

## Entorno local (Windows)

- Shell: PowerShell 5.1. `&&`/`||` no funcionan encadenando comandos fuera de quoted strings — usar `cmd1; if ($?) { cmd2 }`. El call para exes con espacios: `& "path" args`.
- Convención del entorno: dev server en `:3000` (vía `Start-Process powershell -File ...dev-launch.ps1` si hace falta relanzarlo), build real de prueba en `:3100` (`npm start -- -p 3100`, log a `server3100.log`), E2E headless Chrome con flag `--remote-debugging-port=9222` (perfil único por run en `C:\Users\sheik\AppData\Local\Temp\opencode\chrome-repro*`). Health checker: `http://localhost:3000/api/health`.
- `C:\Users\sheik\AppData\Local\Temp\opencode\` es el área de trabajo temporal pre-aprobada (scripts E2E, logs, profiles).
- No matar procesos del usuario: matar listeners de puertos de las apps bajo prueba (3000/3100/9222) es aceptable, pero avisa al terminar.