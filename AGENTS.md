<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Proyecto: Iven (GameVault)

SaaS de inventario para coleccionistas de videojuegos. Repo pequeño, monorepo-ish dentro de `D:\app\iven`. Todo el código de la app vive en `src/`. **NO hay** `middleware.ts`: se usa `proxy.ts` (Next 16) con export `proxy` + `config.matcher`.

## Seguridad — obligatoria en TODO cambio (XSS, SQLi y compañía)

Regla base: **la entrada del cliente es hostil hasta que se valida en el servidor.** Ningún cambio se da por bueno si no se puede responder "¿qué pasa si el usuario manda `"><script>...` o `' OR 1=1 --`?". Ante la duda, se valida/allowlista; nunca se "sanea" a mano con regex.

### 1. XSS / inyección en el navegador
- React escapa por defecto: el texto de usuario (`title`, `notes`, `genre`, `condition`) se pinta como texto, NUNCA como HTML. Nada de plantilla de strings para construir markup.
- **Prohibido `dangerouslySetInnerHTML`** (y `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`). Si una feature exige HTML crudo (p. ej. markdown de descripciones), hay que añadir un sanitizador mantenido (DOMPurify/jsanitize) al pipeline y sanitizar también en servidor, no solo en cliente. Si no hay sanitizador, la feature no se implementa.
- Nunca renderizar URLs de usuario como `href`/`src` sin validarlos: **`javascript:`, `data:`, `vbscript:` y `//host` se bloquean siempre**. Patrón ya en el repo: `isValidImageUrl()` en `src/app/api/games/[id]/route.ts:8` (solo `http:`/`https:` o rutas `/uploads/`). Aplicar la misma validación en CUALQUIER campo de URL nuevo, en el servidor (no confiar en la validación del cliente).
- No meter valores de usuario en atributos `style`, `srcset`, `data-*` que se apliquen, ni construir `<script>`/`<style>` con interpolación (rompe además la CSP con nonce). La CSP con nonce de `src/proxy.ts` es una capa extra, NO un sustituto de escapar la salida.
- Abrir la CSP o añadir un origen externo a `connect-src`/`img-src` es una decisión consciente: justifica en el PR por qué hace falta.

### 2. SQL injection
- Prisma **parameteriza** todo. Regla: solo `prisma.*` con `where`/`data` como objeto. **Prohibido** `$queryRawUnsafe` / `$executeRawUnsafe` y cualquier concatenación que acabe en raw SQL.
- Si de verdad hace falta SQL crudo, usar SIEMPRE el tagged template (`prisma.$queryRaw\`SELECT ... WHERE id = ${id}\``), que escapa los binds; jamás con `+`/`.replace()` sobre la query. Si se necesita una tabla/columna dinámica, va por allowlist de constantes, nunca por el input.
- No construir filtros con `OR`/`where` a partir de query params sin allowlist. Búsqueda de texto: preferir los filtros/contains de Prisma; si hay `sort` dinámico, mapear contra una lista cerrada de columnas (nunca pasar el parámetro crudo a `orderBy`).
- Migraciones: SQL en `prisma/migrations/*` es estático y revisable; nada de DDL generado con valores de runtime.

### 3. Broken Authentication (OWASP A07)
- El JWT de sesión **nunca es la fuente de autorización**: los claims (`role`, `plan`, `banned`) son una caché. Para decisiones que importan, releer de BD (`requireAdmin()`/`getUser()` en `src/lib/guard.ts`); el `jwt` callback ya refresca en cada request, no degradarlo a "leer el token y confiar".
- Toda ruta nueva `api/*` empieza por sesión: `const session = await auth(); if (!session?.user?.id) return 401` (401 = sin sesión, 403 = con sesión sin permiso). El `proxy.ts` NO protege `api` (queda fuera del `matcher`): cada handler es su propia frontera de confianza.
- Admin: `requireAdmin()` **devuelve** un `AdminGuard`, no lanza (lección 15). Toda ruta `api/admin/*` copia el patrón de `api/admin/plans/route.ts` y mira el retorno.
- No inventar un segundo sistema de auth (token propio en cookie/localStorage, JWT manual, `?userId=` para "debug"): una sola sesión (NextAuth v5) y siempre server-side.
- Credenciales: hash con `bcryptjs` (nunca MD5/SHA1 ni texto plano), comparación con `bcrypt.compare` (tiempo constante), longitud mínima razonable en registro, y `emailVerifiedAt` obligatorio para entrar (ya en `authorize`).
- **No enumerar usuarios**: login, verificación y reset responden el mismo mensaje/estado exista o no el email (evita "account enumeration"); el rate limit de `api/auth/*` es parte del control, no un extra.
- Sesiones: no reusar ni devolver el session token al cliente en JSON; logout server-side; no barato "expirar" la sesión solo por `maxAge` del token para eventos sensibles (baneo/rol se resuelven en BD, ya cubierto por los callbacks).
- `AUTH_SECRET` presente y con entropy; nunca en `NEXT_PUBLIC_*`, nunca en logs ni en el repo. Sin `AUTH_SECRET`, NextAuth falla — no degradar a un secret por defecto hardcodeado.
- Open redirect: validar `callbackUrl`/`redirect` contra una allowlist de paths internos (solo relativas que empiecen por `/`, nunca `//host` ni `http:`). Cookies de sesión: `httpOnly` + `secure` en https + `sameSite=lax` (los valores por defecto de NextAuth; no cambiarlos a la baja).
- No filtrar en el login qué falla exactamente (password incorrecto vs email sin verificar vs baneado) más allá de lo ya expuesto al usuario legítimo; los detalles van a `console.error` en servidor.

### 4. CSRF (OWASP A01) e IDOR (OWASP A01/BOLA)
- CSRF: las cookies de sesión se envían solas, así que **toda mutación es POST/PATCH/DELETE + comprobación de origen**. Nunca mutar estado en GET ni en un Server Action sin validar sesión. No tocar `skipCSRFCheck`/`allowedOrigins` de NextAuth para "hacer que funcione": si una mutación falla por CSRF, el bug es del cliente (fetch con `method` correcto y `Content-Type: application/json`), no de la config.
- Los Route Handlers con cookie de sesión están cubiertos por los checks de origin de Next; los webhooks de terceros no: ahí la autenticación es la **firma** (`stripe.webhooks.constructEvent` con `STRIPE_WEBHOOK_SECRET`, equivalente en MP con `MP_WEBHOOK_SECRET`), verificada ANTES de tocar la BD. Un webhook sin validar es una puerta trasera de escritura.
- **IDOR**: el `userId` sale SIEMPRE de la sesión, nunca del body/query/params. Toda query por recurso filtra por propietario: `where: { id, userId: session.user.id }` (patrón de `api/games/[id]` con `updateMany`/`deleteMany` + `count === 0 → 404`). Sin ese filtro, cualquiera edita o borra el juego de otro con solo saber el id.
- Un id de ruta no es autorización: existence check + owner check en la MISMA query. `findUnique({ where: { id } })` sin `userId` y luego "comprobar después" es un bug aunque se filtre en el cliente.
- Verificar también en lecturas (`GET` de un recurso ajeno) y en acciones derivadas (borrar imagen por id, cambiar estado, descargar). Y en panel admin: el rol se comprueba con `requireAdmin()` en el servidor, nunca confiando en que la UI esconde el enlace.
- No comparar contraseñas/tokens con `==`; no loguear contraseñas, sesiones, `AUTH_SECRET`, tokens de Stripe/MP o de Blob. Nada de secretos en `NEXT_PUBLIC_*` (se compilan al navegador).

### 5. Validación de entrada, subidas y DoS
- Todo `body.x` entra como `unknown`: `typeof` + `String(...).trim().slice(0, N)` + validación de rango/formato antes de persistir (referencia: `api/games/route.ts` y `api/games/[id]/route.ts`). Enums contra los exportados por Prisma (`GameStatus`, `Plan`, ...), no contra strings inventados. Fechas: `new Date(...)` + `Number.isNaN(getTime())`. Números: `Number.isFinite`/rangos.
- URLs de imágenes: validar esquema/longitud; idealmente allowlist de hosts (RAWG, el dominio de Blob) en vez de "cualquier https".
- Uploads (`api/games/upload`): mime en allowlist, tamaño máximo, y el nombre de archivo **lo genera el servidor** (`randomBytes`) — jamás usar el nombre enviado por el cliente (path traversal). El contenido se reprocesa con `sharp` (elimina payloads embebidos).
- Rate limit en endpoints nuevos/expensivos con `isRateLimitedRequest` + `rateLimitJsonResponse` (ver `src/lib/rate-limit.ts`), sobre todo auth y uploads.
- Responder 400/401/403 con errores genéricos; los detalles (stack, `error.message` de BD) solo a `console.error` en servidor.

### Checklist antes de dar por terminado un cambio
1. ¿Todo input pasa por validación en servidor antes de tocar BD o render? ¿Con longitudes/rangos?
2. ¿Algún `dangerouslySetInnerHTML`/HTML crudo/`javascript:` en una URL? → fuera.
3. ¿Algún raw SQL con interpolación, o `userId`/rol tomado del cliente? → fuera.
4. ¿La ruta comprueba sesión y propiedad del recurso? ¿Admin con `requireAdmin()` verificado?
5. ¿La mutación es POST/PATCH/DELETE y no depende solo de la cookie? (CSRF)
6. ¿Se loguea algún secreto o dato personal? ¿Se abre la CSP sin justificar?
7. `npm run lint` + `npm run build` en verde, y el diff releído buscando sinks (`innerHTML`, raw, `eval`, `${` dentro de JSX/atributos).

## Patrones de diseño — aplica el mejor según el caso

Principio operative: **primero replica el patrón que ya existe en el repo** (mismo problema ya resuelto en otro archivo) y solo introduce uno nuevo si el caso lo pide. Repo pequeño: no montes una capa de abstracción para un solo uso.

| Si el caso es… | Patrón y dónde vive en este repo |
|---|---|
| Endpoint CRUD | Route Handler delgado (`src/app/api/**/route.ts`) que valida + delega; la lógica de negocio va en `src/lib/*` (ver `api/games/*` → `src/lib/{plans,platforms,game-summary}.ts`) |
| Lógica de negocio reutilizable | Función de dominio en `src/lib/` (p. ej. `getPlanLimit`), no inline en la ruta ni en el componente |
| Múltiples proveedores con la misma interfaz (Stripe / MP) | **Strategy/Adapter**: un contrato por proveedor + registro que elige (ya existe: `src/lib/payments.ts` con `billing.ts`/`stripe.ts`/`mp.ts`) |
| Múltiples salidas para una misma operación (Blob vs filesystem) | **Adapter** con selección por env en runtime (ver `api/games/upload`: `BLOB_READ_WRITE_TOKEN` → Blob, si no `public/uploads`) |
| Acceso a datos con lógica de filtros/reuso | **Repository**: funciones de consulta en `src/lib/*` que devuelven datos ya filtrados; el componente no escribe Prisma |
| Autorización por rol/permiso | **Guard/Policy**: `requireAdmin()`/`getUser()` en `src/lib/guard.ts`; el componente NUNCA decide permisos, solo los pide |
| Datos para pintar | **Server Component** por defecto (fetch en servidor, cero secrets en el cliente); `"use client"` solo para interactividad (Base UI, toasts, uploads) |
| Mutación desde la UI | **Server Action** si es interna, o `fetch` POST/PATCH/DELETE a un Route Handler; siempre con sesión + validación en servidor |
| Estado compartido en cliente | **Context/Provider** (ver `src/components/site/theme-provider.tsx`) o **Compound Component** para componentes configurables; **Custom hook** para estado local compartido |
| Variantes de un componente | `cva` / `buttonVariants` en el wrapper de `src/components/ui/*` (patrón ya establecido por shadcn) |
| Listas heterogéneas de metadatos (planes, plataformas) | **Registry/tabla de constantes** con `as const` + tipo derivado (`PLAN_LADDER`/`PAID_PLANS` en `src/lib/billing.ts`, `locales` en `src/lib/i18n/locales.ts`). Lo que el admin edita (nombres, límites, precios) NO va aquí: va en la tabla `Plan` |
| Errores | Result explícito o `NextResponse.json({ error })` con código genérico; no `throw` de strings para control de flujo, no filtrar detalles al cliente |
| Cliente de BD / singleton | `src/lib/db.ts` (una instancia de Prisma con driver adapter; en dev se cachea en `globalThis`) |

Checklist de diseño antes de dar el cambio por terminado:
1. ¿Podía resolverlo reutilizando un helper/patrón existente en vez de escribir lógica nueva?
2. ¿La ruta queda fina (validar + delegar) o se ha llenado de lógica de negocio?
3. ¿Los tipos derivan de una fuente única (`as const` + `typeof`/enum de Prisma) en vez de repetirse como strings sueltos?
4. ¿El componente decide permisos o datos que solo puede saber el servidor? → debe pedirlo a un Server Component/guard.

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
| UI libs | `lucide-react`, `sonner` (toasts), **ThemeProvider propio** (`src/components/site/theme-provider.tsx`, drop-in de next-themes — ver lección 16), `tailwindcss@4`, `tw-animate-css`, `class-variance-authority`, paquete **`cn`** (`import { cn } from "cn"`) |

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
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`. **Ninguna variable de precio**: ver "Precios en la BD" más abajo.
- MercadoPago: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_CURRENCY_ID` y `CRON_SECRET` (barrido de periodos vencidos).
- **SDK**: se usa el oficial `mercadopago` (v3.6.x), no un cliente HTTP a mano. `src/lib/mp.ts` crea un `MercadoPagoConfig` + `Order` cacheados por proceso y expone `createMpCheckoutOrder` / `getMpOrder` sobre él. El tipo de una order se deriva de la clase pública (`Awaited<ReturnType<Order["get"]>>`, exportado como `MpOrder`) para no importar de `mercadopago/dist/...`. La firma del webhook la verifica el propio SDK (`WebhookSignatureValidator`, HMAC-SHA256 en tiempo constante) — no reimplementarla.
- **Modelo de MP (Checkout Pro con redirección)**: `POST /v1/orders` con `type: "online"`, `processing_mode: "manual"` (el único válido para Checkout Pro) y `capture_mode: "automatic"`. MP devuelve un `checkout_url` **de nivel superior** en la respuesta (no viene en `transactions.payments[]`) y el usuario paga en la página hosted de MP. La redirección es una navegación de nivel superior, así que **no hace falta el SDK de MP en el navegador ni abrir la CSP**. El alta y el upgrade usan exactamente el mismo camino: `payments.ts` devuelve la `checkout_url` y el plan lo concede quien repregunte el estado real de la order.
- **Por qué NO Automatic Payments**: el modelo alternativo de la doc (customer → `stored_credential.store_payment_method` → payment profile → order por ciclo con `processing_mode: automatic_async`) **exige autorización comercial del equipo de Ventas de MP**, así que no es autoservicio. Está descartado a propósito; no reintroducirlo sin hablar con Ventas. La API clásica `/v1/preapproval` sigue documentada y disponible en CL, pero la app no la usa.
- **Lo que este modelo NO tiene**: no se guarda tarjeta (ni customer, ni payment profile, ni `stored_credential`), **MP no agenda cobros** y no hay prorrateo. Cada pago da los días que marque `Plan.durationDays` (30 por defecto, se edita en `/admin/plans`) de acceso y el siguiente ciclo vuelve a pasar por el checkout.
- **Campos de MP en `User`**: solo `mpLastChargeAt`, el inicio del último periodo pagado. Es a la vez el ancla del ciclo y la **única marca de que el pago vino de MP** (un usuario de Stripe la tiene a `null`), por eso `activeProviderFor` deduce el proveedor de ahí. La migración `20260926200000_mp_checkout_pro_redirect` dropeó `mpCustomerId`, `mpPaymentProfileId`, `mpPaymentProfileStatus`, `mpPaymentMethodId`, `mpLastPaymentReferenceId` y `mpSubscribedPlan`; no volver a consultarlos.
- **Barrido de vencimientos**: `GET|POST /api/mp/expire`, en `vercel.json` con cron diario (`0 9 * * *`). Vercel Cron dispara **GET** con `Authorization: Bearer $CRON_SECRET`; sin `CRON_SECRET` responde 503 sin hacer nada (fail-closed) y compara con `timingSafeEqual`. Degrada a `FREE`/`INACTIVE` solo a quien tiene plan de pago y `mpLastChargeAt` más antiguo que el periodo **de su plan** (`planDurationDaysOf`), y limpia `mpLastChargeAt` al hacerlo. La consulta usa la duración **máxima** como superconjunto de candidatos (para no dejar fuera a nadie) y el bucle vuelve a comprobar el plazo del plan de cada fila: con la misma instantánea de duraciones ambos cortes coinciden y el del bucle es red de seguridad para el caso de que el admin edite `/admin/plans` mientras corre el barrido. El filtro `lt` sobre `mpLastChargeAt` excluye los `null`, así que **nunca toca a un cliente de Stripe**. El grant de un pago nuevo es siempre del webhook, nunca del cron.
- **Upgrade en MP**: no hay prorrateo ni portal, así que subir de plan **es pagar el plan nuevo**: `mpUpgradePlan` devuelve la `checkout_url` de una order por su importe y el plan entra cuando esa order se apruebe. La autogestión es **cancelar** desde la propia app (`POST /api/billing/portal` con `provider: "mp"` → plan a `FREE`, `mpLastChargeAt` a `null`), que solo significa "no me cobres el mes que viene".
- **Seguridad de la `checkout_url`**: es el único destino al que se manda al usuario con `window.location.assign`, así que `isValidMpCheckoutUrl` exige `https` y un host `mercadopago.<tld>` (incluye `mercadopago.com.ar`). Sin eso, un `checkout_url` raro sería un redirect abierto desde la página de facturación. Un importe siempre sale de `Plan.mpPriceMinor` (nunca del cliente) y en monedas sin decimales (CLP, JPY, KRW...) va sin parte decimal o MP devuelve 400.
- **Webhooks de MP**: un solo tópico, `order`, en `src/app/api/mp/webhook/route.ts` (no hay `payment_profile` porque no se guarda tarjeta). `data.id` se valida con `isValidMpOrderId` antes de meterse en un path; la firma (`x-signature: ts=…,v1=…` con manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) la comprueba `verifyMpSignature`, que delega en el SDK y **prueba las dos grafías del `data.id`** (la doc y sus ejemplos lo minúsculas, pero MP lo envía tal cual se escribió el recurso): ambas están firmadas con el mismo secreto, así que no abre nada y evita quedarse mudo en producción. **Nunca se confía en el estado del evento**: se repregunta con `getMpOrder` y es esa respuesta la que manda. La fila se localiza por el `userId` dentro del `external_reference` (`gv_<userId>_<PLAN>`; MP rechaza el `:`), validado contra la allowlist de planes, y un pago de un plan inferior no degrada (`TIER_RANK`).
- **Reconciliación**: el grant viene **solo** del webhook. Los query params de la return URL solo pintan el mensaje del billing (de ahí el `?checkout=success|canceled`); si el webhook tarda, el usuario ve su plan antiguo hasta que llegue. Si algún día se quiere reconciliar en la vuelta, es un endpoint nuevo que repregunta a MP por el `order_id` — no leer el estado de los query params.
- **Pruebas de MP (solo local)**: Checkout Pro manda al usuario a la página de MP, así que no hay nada que tokenizar ni tarjeta que proponer: basta con credenciales de prueba del panel y una tarjeta de prueba de la lista de MP. **No se manda `payer` a propósito**: es opcional, el usuario escribe su email en la página de MP, y el sandbox exige que ese email termine en `@testuser.com` (error `invalid_email_for_sandbox`), así que mandar el email real de un usuario rompería el checkout de prueba. MP exige que **pagador y collector sean los dos reales o los dos de prueba** (mandar la tarjeta de prueba a un collector real se rechaza con `Both payer and collector must be real or test users`), así que no se mezclan credenciales. No hay `MP_TEST_CARD_TOKEN`/`MP_TEST_PAYER_EMAIL` ni `isMpTestAccount()`: nada de eso hace falta en este modelo.

- **`BLOB_READ_WRITE_TOKEN`** (Vercel Blob) — imágenes de portada/capturas subidas en `/api/games/upload`. En Vercel el filesystem es efímero y `public/` es inmutable en runtime: sin token las subidas fallan/caen; se usa el store de Blob (plan gratuito 5GB, sin tarjeta en Hobby). Sin la variable, en local hay fallback a `public/uploads/`.
- Email: `RESEND_API_KEY` (+ remitentes) para `src/lib/email.ts` (verificación de correo, alertas)
- **`SITE_URL`** (SEO, obligatorio en producción) — URL pública sin barra final. Es la base de `metadataBase` y de todas las URLs absolutas que emitimos: canonical, hreflang, `openGraph.url`, `/sitemap.xml`, `/robots.txt` y el JSON-LD (`src/lib/seo.ts`, con fallback a `NEXT_PUBLIC_APP_URL` y luego a `http://localhost:3000`). Sin ella en producción los canonicals caen a localhost y Google indexa una URL inexistente. También la lee `src/app/[lang]/opengraph-image.tsx` para el host de la tarjeta social.
- **Captcha (auth)**: Cloudflare Turnstile. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública; se compila en el build de Vercel: añadir + redeploy) y `TURNSTILE_SECRET_KEY` (server, valida contra siteverify). Widget en `src/components/auth/turnstile.tsx` (render explícito, `appearance: interaction-only`, token por callback, nunca input oculto en el `<form>`), verificación en `src/lib/turnstile.ts`. Aplicado en `POST /api/auth/register`, `POST /api/auth/resend-verification` y en el login por credenciales (`authorize` de `src/auth/config.ts`, con el token en `captchaToken`; el fallo devuelve el mismo `null` que una contraseña incorrecta, a propósito). `GET /api/auth/verify` NO lleva captcha: es un clic sobre el link del email, sin formulario donde pintarlo (solo rate limit). Sin la secret la verificación se omite (warning) **en desarrollo**; en `NODE_ENV=production` es fail-closed (`reason: "not_configured"`). El auto-login inmediato tras el registro exime del captcha con el `signupTicket` firmado (HMAC + `AUTH_SECRET`, 2 min, atado al email) de `src/lib/signup-ticket.ts`: **no es una credencial ni una sesión**, sin él sigue haciendo falta la contraseña.
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
    [lang]/                       # segmento de idioma: page, layout, login, signup, pricing, app/{index,stats,billing,account,games/[id],games/[id]/edit}, admin/{users,games,subscriptions,platforms,plans,payments}, suspended, not-found
    api/
      auth/register, verify, resend-verification, [...nextauth]
      games + games/[id]          # CRUD del inventario del usuario (PATCH/POST/DELETE)
      games/upload                # subida de imágenes (Vercel Blob si hay token, si no filesystem local)
      rawg/search                 # busqueda de juegos (RAWG)
      admin/users, admin/users/[id], admin/games, admin/games/[id], admin/payment-providers
      billing/checkout, billing/portal, billing/upgrade
      stripe/webhook, mp/webhook
      health                       # GET /api/health (para health-checks E2E)
  auth/ index.ts (handlers) + config.ts (providers/callbacks)
  lib/   db, guard, admin-emails, auth(i18n helpers), plans, payments, billing, payment-history, money, providers, payment-providers, stripe, mp, rawg, email, rate-limit, utils, game-summary, i18n/{locales,get-dictionary}
  components/ site/* , auth/* , ui/* , inventory/* , billing/* , admin/*
  messages/ es.ts, en.ts          # diccionarios (JSON-like, tipados por Locale)
  generated/prisma/               # cliente generado (NO editar)
```

- Todos los paths de import usan alias `@/*` → `src/*`.
- Servicios de pago/mail: `src/lib/payments.ts` (estratos de pago, para usar checkout por lookup de planes), `src/lib/plans.ts` (planes FREE/PRO/COLLECTOR), `src/lib/billing.ts` (portal de cliente), `src/lib/stripe.ts`/`mp.ts` (clientes SDK configurados por env).

### Medios de pago (interruptor del admin)
- `src/lib/providers.ts` es el **registro** de proveedores: la lista sale del enum `PaymentProvider` de Prisma y `PROVIDER_ENV` declara qué variables de entorno necesita cada uno (`isProviderConfigured` / `missingProviderEnv`). Es la única fuente de "qué falta para cobrar": `isMpConfigured()` de `mp.ts` delega ahí, no vuelve a duplicar la regla.
- `src/lib/payment-providers.ts` cruza esa configuración con el interruptor del admin (tabla `PaymentProviderSetting`, una fila por proveedor; **sin fila = habilitado**): `getAvailableProviders()` (lo que se ofrece), `listProviderAvailability()` (estado para el panel) y `setProviderEnabled()`.
- Panel: `/[lang]/admin/payments` + `PATCH /api/admin/payment-providers` (`requireAdmin()`, `provider` contra la allowlist, `enabled` tiene que ser booleano de verdad).
- **El interruptor solo cierra compras nuevas** (`POST /api/billing/checkout`). `portal` y `upgrade` lo ignoran a propósito y se quedan con `isProviderConfigured`: apagar un medio de pago no puede dejar a quien ya paga sin portal ni cambio de plan. Los webhooks nunca lo miran (procesan cobros reales). Al añadir un gate nuevo, decidir explícitamente si es "compra nueva" o "suscripción viva" y usar la función que corresponda.


### Proxy / seguridad (`src/proxy.ts`)
- **CSP estricta con nonce** (`strict-dynamic`): se genera nonce por petición (crypto `randomBytes`) y se propaga como cabecera de request `x-nonce` (requisito de SSR dinámico de Next) + de respuesta. `'unsafe-eval'` solo en dev. `connect-src 'self' https://challenges.cloudflare.com` (Turnstile exige su host en script/connect/frame según sus docs; StripJS va por `frame-src`). Si algo de terceros necesita conectividad (webhooks client-side), hay que abrir la CSP intencionalmente.
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
- Modelos: `User`, `Platform`, `Plan`, `Game`, `GameImage`, `Account`, `Session`, `VerificationToken`. FKs de los modelos hijo con `onDelete: Cascade` → borrar un User vía SQL/`deleteMany` limpia sus juegos. Enums: `Plan` (FREE/PRO/COLLECTOR), `GameStatus` (OWNED/SEALED/CIB/LOOSE/DIGITAL/WISHLIST/SELLING), `SubscriptionStatus` (ACTIVE/INACTIVE/PAST_DUE/CANCELED/TRIALING). `Game` campos: title, **platformId** (FK → `Platform`, `onDelete: Restrict`), genre, status, condition, purchasePrice (Decimal), purchaseDate, notes, coverImageUrl, rawgId, playtimeMin; índices en userId/platformId/status. **Las plataformas NO son texto libre**: las define el admin en `/admin/platforms` (tabla `Platform` con `name`/`slug` únicos, `onDelete: Restrict` en Game) y el cliente solo selecciona. Helpers en `src/lib/platforms.ts` (client-safe): `normalizePlatform`, `slugifyPlatform`, `resolvePlatformId` (mapea nombre RAWG contra la lista; fallback a una plataforma llamada "Otra"/"Other"). Reescribir una migración a mano para backfill usa timestamp propio en `prisma/migrations/` + `prisma migrate deploy` (Prisma 7 no permite `migrate dev --create-only` no-interactivo con NOT NULL sin datos).
- Para tareas SQL directas usa `npx prisma db execute --file <sql>` (NO `--schema`, Prisma 7 no lo soporta). El prisma genera credenciales desde `.env`.

### Precios en la BD (NO en el entorno)
- `Plan` es la ÚNICA fuente de los importes: `priceCents` (céntimos USD, Stripe), `mpPriceMinor` (unidades menores de `MP_CURRENCY_ID`) y `stripeProductId` (Product de Stripe, opcional). Se editan en `/admin/plans` (`api/admin/plans`); cambiar un precio es un UPDATE, no un redeploy. Migración `20260926230000_plan_pricing_in_db` (backfill COLLECTOR 499/4990, PRO 999/9990, `stripeProductId` a `NULL`).
- **La duración del periodo también es de la BD**: `Plan.durationDays` (`Int`, `@default(30)`, migración `20260926233000_plan_duration_days`), los mismos días para Stripe y para MP — no hay periodo por proveedor. Rango único `MIN/MAX_PLAN_DURATION_DAYS` (1/1095) en `src/lib/plans.ts`, validado en el admin (400 `invalid_duration_days`), y `planDurationDaysOf()` cae a `DEFAULT_PLAN_DURATION_DAYS` (30) si la fila trae algo inválido. El 1095 es el tope de Stripe (3 años): un plan más largo sería vendible en MP pero rechazable en Stripe, así que ni se deja configurar. `stripeRecurring()` traduce días a `interval`/`interval_count` (day/week/month/year) y `planPeriodLabel()` pinta el periodo real en precios y facturación (30 días = `/mes`; el plural sale de `Intl` y el singular sin número de `pricing.periodDay/Week/Year`).
- **Stripe manda `price_data` inline** (`currency: "usd"`, `unit_amount` de `priceCents`, y un `recurring` derivado de `Plan.durationDays` con `stripeRecurring()`: `interval` + `interval_count`): no hay Price objects ni variables de precio, y cada compra genera un Price propio porque los Prices son inmutables. El upgrade es la excepción: ahí `price_data.product` es obligatorio y no admite `product_data`, así que se usa `stripeProductId` y, si es `null`, el producto del Price que la suscripción ya tiene.
- **El plan viaja en la metadata de la suscripción** (`subscription_data.metadata.plan` en el checkout, y metadata en el MISMO `subscriptions.update` del upgrade), no derivado de un price id: es lo que lee el webhook (`planFromSubscriptionMetadata`, allowlist `PAID_PLANS`). Si el upgrade no la actualizara, el `subscription.updated` leería el plan viejo con la factura ya cobrada. Una suscripción **sin** plan en la metadata solo actualiza el estado: degradar ahí a FREE era el bug de "paga pero no tiene plan".
- **Unidades menores, siempre**: los importes se guardan y se transportan en minor units y multiplicar por 100 es del formateador. `src/lib/money.ts` es el módulo **client-safe** con la tabla de monedas sin decimales y el formateo; `mp.ts`/`billing.ts` son `server-only` y lo delegan. No copies esa tabla a un componente cliente: el panel de admin importa `money.ts` precisamente para no divergir. Los inputs del admin van en unidades menores (499 = $4.99, 4990 CLP = $4.990) y muestran la previsualización formateada al lado.
- Un plan de pago con precio `null` (o 0) **no se vende** por ese proveedor: el checkout responde 503 `plan_unavailable` y la UI lo dice ("Precio por definir"), no lo pinta como $0. El JSON-LD del home lo **omite** en vez de publicar una oferta a 0.
- `PLAN_LADDER`/`PAID_PLANS` en `src/lib/billing.ts` siguen siendo la allowlist de planes **comprables** (los que el admin puede añadir a `/admin/plans` no se venden sin tocar ese array). `getPlanPrice`/`getPlanStripeProduct` en `src/lib/plans.ts` van con `cache()`.

### Historial de pagos (`Payment`)
- `Payment` es la foto de un **cobro confirmado** (migración `20260927000000_payment_history`): `provider` (`stripe`/`mp`), `externalId`, `userId`, `plan`, `amountMinor` + `currency`, `durationDays` y `status`. **No es un libro mayor**: solo se guarda `paid` (no hay `failed`, `refunded` ni `pending`). `@@unique([provider, externalId])` es la idempotencia; `amountMinor` va en unidades menores de `currency` y el formateo es de `src/lib/money.ts` (`formatMinorCurrency`). `User.payments` en cascade.
- **Dónde se escribe (y solo ahí)**: `recordPayment()` de `src/lib/payment-history.ts` (upsert). Lo llaman dos sitios y ninguno más — MP en `settleMpCheckout` (`src/lib/mp-settlement.ts`) **después** de conceder/renovar el plan, y Stripe en el handler `invoice.paid` de `src/app/api/stripe/webhook/route.ts`, que **no toca plan ni suscripción** (solo lee `invoice.parent.subscription_details.metadata.plan` y guarda `amount_paid`, `currency` y `invoice.id`). Nada de esto depende del estado de un query param: el grant sigue siendo del webhook.
- **Backfill de MP, no de Stripe**: cuando un pago se liquidó antes de que existiera la tabla, `/app/billing` llama a `backfillMissingPaymentsForUser()` (mismo archivo), que cruza `MpCheckout.status = "paid"` con lo ya registrado y rellena lo que falte (lote `PENDING_BATCH`). Es idempotente y cada visita solo repara lo pendiente. **No se hace para Stripe**: no hay copia local de facturas y sincronizar contra la API de Stripe en cada visita sería lento y un vector de amplificación; Stripe histórico no se recupera solo.
- **Lectura siempre por propietario**: `listUserPayments(userId)`/`countUserPayments(userId)` filtran por el `userId` de la sesión; el componente `src/components/billing/payment-history.tsx` es un Server Component que no recibe ids del cliente. La UI pinta el nombre del plan desde el registro **activo** (los desactivados caen al slug) y formatea con la moneda del propio pago.
- **Producción**: el endpoint de Stripe tiene que tener suscrito `invoice.paid` en el panel (si no, los cobros de Stripe no aparecen en el historial) y el de MP sigue siendo `/api/mp/webhook`.
- **En local, la lista de eventos es explícita y es un segundo sitio que puede quedarse viejo**: `stripe-dev.ps1` arranca `stripe listen --events <lista>` y la CLI 1.52+ **solo reenvía lo que pone ahí** (no lo manda todo). Sin `invoice.paid` en esa lista el listener entrega `checkout.session.completed` y `customer.subscription.updated` (el plan se concede) pero **nunca el evento del dinero**: el pago de Stripe no aparece en el historial, sin error ni aviso, porque el handler existe y es correcto. La lista debe ser el espejo de las claves del mapa `handlers` de `src/app/api/stripe/webhook/route.ts`; al tocar uno, tocar el otro.

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
13. **Hydration mismatch por estado derivado del tema**: `ThemeProvider` propio no conoce el tema en SSR (`resolvedTheme` = undefined → rama "light"), pero en el primer render del cliente ya tiene el valor real (localStorage/matchMedia) → atributos del DOM divergen ("A tree hydrated but some attributes... didn't match"). Ocurrió con el `aria-label` de `ThemeToggle` (`src/components/site/theme-toggle.tsx`). Fix idiomático: `suppressHydrationWarning` en el elemento (lo mismo que hace next-themes en `<html lang>`); el valor se autocorrige cuando el effect del provider refresca `resolvedTheme`. NO usar `setState` en un effect para un guard `mounted`: el lint `react-hooks/set-state-in-effect` lo rechaza. Reproducción/verificación de hydration: Chrome headless + CDP (`Emulation.setEmulatedMedia` prefers-color-scheme + capturar `Runtime.consoleAPICalled` error).
14. **Archivo `"use server"` solo puede exportar funciones async**: exportar una constante (p. ej. una clave de cookie o un valor de configuración) desde un archivo de server actions rompe el build ("Only async functions are allowed"). Las constantes de runtime viven en un módulo normal (como `src/lib/i18n/locales.ts`); el archivo de actions solo exporta las funciones async. Al crear una action, no mezclar helpers/constantes en el mismo módulo.
15. **`requireAdmin()` devuelve un `AdminGuard`, NO lanza**: `await requireAdmin()` sin mirar el retorno dejaba `/api/admin/plans` abierto (GET/PATCH funcionaban sin sesión: "unauth PATCH ok: 200"). Toda ruta `api/admin/*` debe hacer `const guard = await requireAdmin(); if (!guard.authorized) return NextResponse.json({ error: guard.status === 403 ? "forbidden" : "unauthorized" }, { status: guard.status })` (patrón de `api/admin/plans/route.ts`).
 16. **Reemplazo de `next-themes` por un `ThemeProvider` propio**: `next-themes@0.4.6` con React 19 dispara en dev el warning "Encountered a script tag while rendering React component" (inyecta su script anti-FOUC dentro del árbol React) — ver lección 13; el fix upstream no llega. Lo reemplazamos por `src/components/site/theme-provider.tsx` (drop-in: `ThemeProvider` + `useTheme` con la misma API `{ theme, resolvedTheme, setTheme }`, storage key `"theme"`). **Detalle clave: el script inline anti-FOUC se inyecta con `useServerInsertedHTML` (hook de `next/navigation`, "use client", visible en la página 0)**, NO con un `<script>` en el JSX: así Next lo pone en el payload HTML inicial fuera del árbol React y la CSP strict-dynamic + nonce lo admite sin warning; mismo patrón que los inicios de CSS-in-JS. Props soportadas: `defaultTheme`, `enableSystem`, `disableTransitionOnChange` (clase `gv-no-transition` en `globals.css`), `nonce`. Consumidores que usan `useTheme`: `theme-toggle.tsx`, `sonner.tsx` (toasts). Al tocar tema NUNCA volver a `next-themes` (dependencia desinstalada): el upstream sigue sin fix para React 19.
 17. **`"$$10.00"` en el payload RSC no es un precio duplicado**: el protocolo *flight* de React escapa con un `$` extra cualquier string que empiece por `$` (para que no se confunda con sus marcadores de referencia `$L…`/`$12`), y el cliente lo desescapa. Buscar el precio en el **texto renderizado** (el HTML sin `<script>`), no en `self.__next_f`: da exactamente el mismo diagnóstico que el formateador y evita perseguir un bug inexistente. Lo mismo vale para leer datos del payload RSC con `Select-String`: escapa las comillas.
 18. **`next dev` NO type-checkea**: un nombre de campo equivocado compila y "funciona" en dev (caía al fallback y daba la sensación de que estaba bien) y solo lo pilla `npm run build` (que corre `tscript`/TS). Passé `order.currency_id` (no existe: la API de MP devuelve `currency` en la order, verificado contra el sandbox) y el error real apareció en el build. Ante cualquier campo de un SDK de terceros: comprobar el tipo en `node_modules` y confirmar contra la API, no asumir la nomenclatura de la documentación.
 19. **Las columnas `timestamp without time zone` (p. ej. `User.mpLastChargeAt`) no son UTC para un script suelto**: Prisma las lee como UTC, pero el driver HTTP de Neon devuelve un `Date` que Node parsea en la zona **local** de la máquina, así que un `2026-09-27 03:26:04.986` se imprime como `06:26Z` en hora de Chile. Para leerlas o restaurarlas sin inventarse un desfase, usa `SELECT "col"::text` (texto crudo) y escribe **literales naive** (`'2026-09-27 03:26:04.986'::timestamp`, sin `Z`): un `'...Z'::timestamptz` pasa por la conversión de zona de la sesión. Y ojo con los scripts ad-hoc: un `.ts` suelto ejecutado con `node --experimental-strip-types` solo resuelve `node_modules` desde la raíz del repo (en un subdirectorio falla a veces con `ERR_MODULE_NOT_FOUND`); un `.mjs` en la raíz es lo fiable.

## Entorno local (Windows)

- Shell: PowerShell 5.1. `&&`/`||` no funcionan encadenando comandos fuera de quoted strings — usar `cmd1; if ($?) { cmd2 }`. El call para exes con espacios: `& "path" args`.
- Convención del entorno: dev server en `:3000` (vía `Start-Process powershell -File ...dev-launch.ps1` si hace falta relanzarlo), build real de prueba en `:3100` (`npm start -- -p 3100`, log a `server3100.log`), E2E headless Chrome con flag `--remote-debugging-port=9222` (perfil único por run en `C:\Users\sheik\AppData\Local\Temp\opencode\chrome-repro*`). Health checker: `http://localhost:3000/api/health`.
- `C:\Users\sheik\AppData\Local\Temp\opencode\` es el área de trabajo temporal pre-aprobada (scripts E2E, logs, profiles).
- No matar procesos del usuario: matar listeners de puertos de las apps bajo prueba (3000/3100/9222) es aceptable, pero avisa al terminar.