# Iven (GameVault)

SaaS de inventario en la nube para coleccionistas de videojuegos.

Este README es la **guía técnica de desarrollo**: explica cómo funciona la app por dentro y cómo hacer modificaciones. Para el funcionamiento como usuario final, ver [`MANUAL.md`](./MANUAL.md). Para las reglas que usa el agente de IA del repo (lecciones, gotchas, convenciones), ver [`AGENTS.md`](./AGENTS.md).

---

## 1. Stack (versiones reales instaladas)

| Pieza | Versión | Notas |
|---|---|---|
| Next.js | 16.3.6 | App Router, Turbopack (dev), `proxy.ts` en vez de `middleware.ts` |
| React | 19.2.8 | — |
| Base UI | `@base-ui/react@1.8.0` | APIs distintas a lo habitual (ver §7) |
| shadcn/ui | v4 wrappers sobre Base UI | salida en `src/components/ui/`, config `components.json` |
| Prisma | 7.10.0 | `provider = "prisma-client"` (cliente generado en `src/generated/prisma`) + **driver adapter** Neon |
| NextAuth | v5 beta (`next-auth@5.0.0-beta.32`) | sesión JWT, `trustHost: true`, `proxy.ts` solo en Next 16 |
| DB | PostgreSQL en Neon | vía `@neondatabase/serverless` |
| Pagos | `stripe` + MercadoPago | implementación propia en `src/lib/{stripe,mp,payments,billing}.ts` |
| Storage | `@vercel/blob` | imágenes subidas (`/api/games/upload`); fallback filesystem `public/uploads/` en local |
| i18n | homemade (sin next-intl) | ver §6 |
| UI libs | `lucide-react`, `sonner`, `class-variance-authority`, paquete `cn`, `tailwindcss@4`, `tw-animate-css`, **ThemeProvider propio** (`src/components/site/theme-provider.tsx`, drop-in de next-themes) | |

Otras dependencias: `bcryptjs` (hash de contraseñas), `resend` (email), `class-variance-authority`, `@vercel/blob`.

---

## 2. Puesta en marcha

### Requisitos
- Node.js (npm), cuenta de Neon Postgres, y opcionalmente las claves de las integraciones (ver `.env.example`).

### Instalación y comandos

```bash
npm install
npm run dev            # dev server (Turbopack) en :3000
npm run build          # prisma generate && prisma migrate deploy && next build
npm start -- -p 3100   # servir la build real (para pruebas E2E contra producción)
npm run lint           # eslint (sin args)
npm run db:generate    # prisma generate
npm run db:migrate     # prisma migrate dev (crea y aplica migraciones)
npm run db:deploy      # prisma migrate deploy (aplica migraciones pendientes, CI/prod)
npm run db:studio      # navegador visual de BD
```

Nota Prisma 7: el CLI usa `prisma7.config.ts`; **no existe la flag `--schema`**. Para SQL directo: `npx prisma db execute --file <sql>`.

### Variables de entorno (`.env`, no commitear)

Ver el detalle completo en [`.env.example`](./.env.example). Las que lee el código:

- `DATABASE_URL` — conexión Neon (la usa el driver adapter; pool/SSL automático).
- `AUTH_SECRET` — firma del JWT de NextAuth.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — opcionales; sin ambas, el provider Google se omite.
- `ADMIN_EMAILS` — lista separada por comas (case-insensitive). **Mecanismo de admin**: en cada login y en cada `requireAdmin()` el usuario cuyo email esté en la lista es promovido a `role: "admin"`. Vacía → nadie es admin.
- `RAWG_API_KEY` — búsqueda de juegos en el alta (RAWG). Sin ella, la búsqueda devuelve `[]`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_COLLECTOR`.
- MercadoPago: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_CURRENCY_ID`, `MP_PREAPPROVAL_PLAN_PRO/COLLECTOR`, `MP_PRICE_PRO/COLLECTOR`.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob para imágenes (sin token, en local las imágenes caen en `public/uploads/`).
- Email: `RESEND_API_KEY`, `EMAIL_FROM`. **Sin `RESEND_API_KEY`, el registro auto-verifica** (no se puede login con correo no verificado si el email se envía).
- `SITE_URL` — base para el `metadata.metadataBase` del layout raíz.

Cambios en `.env` requieren reiniciar el dev server.

---

## 3. Estructura del proyecto

```
prisma/
  schema.prisma         # modelos + enums (fuente de verdad de BD)
  migrations/           # migraciones versionadas (incluyen seeds de plataformas y planes)
prisma7.config.ts       # config del CLI de Prisma 7 (schema, migrations, datasource URL)
src/
  proxy.ts              # "middleware" Next 16: CSP+nonce, headers, redirect locale, guard /app
  auth/                 # NextAuth v5
    index.ts            #   handlers, auth, signIn, signOut
    config.ts           #   providers (credentials + Google opcional) y callbacks (jwt/session/signIn)
  app/
    [lang]/             # segmento de idioma (es|en)
      page.tsx          #   home (landing + pricing)
      layout.tsx        #   layout raíz (ThemeProvider, SessionProvider, header/footer, fonts)
      login/ signup/ suspended/ not-found/ pricing/
      app/              #   sección autenticada
        page.tsx        #     inventario
        stats/          #     estadísticas
        billing/        #     planes y facturación
        account/        #     cuenta
        games/[id]/     #     ficha de juego + games/[id]/edit (formulario de edición)
      admin/            #   panel admin (guarded por requireAdmin)
        layout.tsx      #     nav + guard
        users/ games/ subscriptions/ platforms/ plans/
    api/
      auth/register, verify, resend-verification, [...nextauth]
      games, games/[id], games/upload
      rawg/search
      billing/checkout, billing/portal
      stripe/webhook, mp/webhook
      admin/users, admin/users/[id], admin/games, admin/games/[id], admin/plans, admin/platforms, admin/platforms/[id]
      health
  components/
    ui/                 # wrappers finos de Base UI (button, dialog, dropdown-menu, select…)
    site/               # header, footer, auth-nav, theme-provider, theme-toggle, locale-switcher, pricing-cards
    auth/               # login-form, signup-form
    inventory/          # grid, add-game-dialog, edit-game-form, game-card-actions, image-lightbox…
    billing/            # billing-client
    admin/              # client components de cada sección admin
  lib/
    db.ts               # cliente Prisma con adapter Neon (singleton)
    guard.ts            # requireAdmin() + promoción por ADMIN_EMAILS
    admin-emails.ts     # ADMIN_EMAILS parseado
    plans.ts            # helpers del plan (límites) — client-safe? No: server-only
    billing.ts          # TIER_RANK, PLAN_META (precios USD), proveedores habilitados, price ids
    payments.ts         # orquestador checkout/portal por proveedor (Stripe/MP)
    stripe.ts mp.ts     # clientes SDK/config por proveedor
    email.ts            # Resend (verificación)
    rate-limit.ts       # fixed-window en memoria por IP
    rawg.ts             # cliente RAWG para búsqueda (server-only)
    platforms.ts        # helpers de plataformas (normalize/slugify/resolve) — client-safe
    game-summary.ts     # transforma Game → GameSummary para la UI
    utils.ts            # re-export de cn
    i18n/               # locales.ts (idiomas), get-dictionary.ts (carga diccionario)
  messages/             # diccionarios i18n (es.ts, en.ts), tipado por Dictionary
  generated/prisma/     # cliente Prisma generado — NO editar (se regenera en build)
  types/next-auth.d.ts  # ampliación de la sesión (id, plan, role, banned)
```

- Alias de import: `@/*` → `src/*`.
- `src/proxy.ts` exporta `proxy` + `config.matcher` (NO `middleware`): convención de Next 16.
- `src/generated/prisma/` está en `.gitignore` y se regenera con `npm run build` / `npm run db:generate`.

---

## 4. Modelo de datos (Prisma + Neon)

`prisma/schema.prisma` es la fuente de verdad. Modelos:

| Modelo | Descripción |
|---|---|
| `User` | Cuenta, `plan` (texto, default `FREE`), `role` (`user`/`admin`), `bannedAt`, `emailVerifiedAt`, ids de Stripe/MP y estado de suscripción |
| `Platform` | Plataformas gestionadas por el admin (`name`/`slug` únicos). **No son texto libre**: el cliente solo selecciona. `onDelete: Restrict` desde Game |
| `Plan` | Planes DB-driven (`slug`, `nameEs`, `nameEn`, `gameLimit` nullable=ilimitado, `imageLimit`, `paid`, `active`, `sortOrder`) |
| `Game` | Juego del inventario (pertenece a un `User`, FK a `Platform`). `coverImageUrl` (portada, puede venir de RAWG), `images` → GameImage |
| `GameImage` | Fotos por juego (posición 0 = portada). `onDelete: Cascade` desde Game |
| `Account`, `Session`, `VerificationToken` | Tablas del adapter de Auth.js |

Enums (exportados desde `@/generated/prisma/enums`): `Plan` legacy no existe (plan es texto); `GameStatus` (OWNED/SEALED/CIB/LOOSE/DIGITAL/WISHLIST/SELLING), `SubscriptionStatus` (ACTIVE/INACTIVE/PAST_DUE/CANCELED/TRIALING).

Semillas en migraciones: todos los `Platform` (migración `..._seed_all_platforms`) y los `Plan` por defecto (migración `..._add_dynamic_plans`): FREE (25 juegos, 1 foto), PRO (500, 3), COLLECTOR (∞, 5).

### La regla de límites
- El **plan real se lee de BD en cada request** (autoritativo), nunca del JWT: un plan expirado/cambiado por webhook se refleja al momento.
- Límite de juegos: `gameLimit` (`null` = ilimitado). Se valida en `POST /api/games` con un `count()`.
- Límite de fotos: `imageLimit` por juego. Se valida en el upload (`/api/games/upload`) y en el PATCH de imágenes.

### Migraciones
- Crear con `npm run db:migrate` (genera + aplica) o a mano con timestamp propio en `prisma/migrations/` y aplicar con `npm run db:deploy` (Prisma 7 no permite `migrate dev --create-only` no-interactivo con NOT NULL sin datos).
- El build ejecuta `db:deploy` siempre: en CI/prod es automático.

---

## 5. Arquitectura y flujo de una petición

### Enrutado y proxy (`src/proxy.ts`)
El `proxy` corre antes que las rutas y hace, en orden:
1. **CSP + headers de seguridad** (ver §8).
2. **Redirección de locale**: paths sin `/es|/en` → se añade el idioma detectado por `accept-language` (default `es`).
3. **Home logueado** → redirige a su inventario (`/{locale}/app`).
4. **Guard de `/app/**`**: valida el JWT de NextAuth con `getToken` (`secureCookie` según `https:`, porque en HTTPS Auth.js usa la cookie `__Secure-`). Sin sesión → `/login?callbackUrl=...`.
5. Aplica los headers CSP a la respuesta final.

`matcher` excluye `api|_next/static|_next/image|favicon.ico|.*\..*`.

Las rutas de la API **no pasan por el proxy** (están excluidas), así que cada API route hace su propia autenticación con `auth()` / `requireAdmin()`.

### Autenticación (NextAuth v5, JWT)
- Providers: **credentials** (email+password, bcrypt, exige `emailVerifiedAt`, bloquea `bannedAt`) y **Google** opcional. En signIn Google: upsert por `user.email` (reutiliza cuenta existente o la crea).
- Callbacks `jwt`/`session`: leen el usuario desde BD en cada request y refrescan `id/plan/role/banned` en el token/sesión. Cambios de rol/baneo se ven al instante.
- Baneo: `bannedAt` → deny en `authorize` y en `signIn`; `requireAdmin` también rechaza. Página `/suspended`.
- `ADMIN_EMAILS` promueve admins en login (`config.ts` signIn) y en `requireAdmin()` (`guard.ts` promoteByEnv).

### Registro + verificación de correo
1. `POST /api/auth/register` → crea `User` + `VerificationToken` (24 h) + envía email (Resend).
2. Sin `RESEND_API_KEY`, `emailVerifiedAt` se pone automáticamente y el login funciona directo.
3. `GET /api/auth/verify?token=...&email=...` → valida token/expirado, marca verificado, borra el token, redirige a `/login?verified=1`.
4. `POST /api/auth/resend-verification` reenvía el token.

### i18n (homemade)
- Segmento `[lang]`; `src/lib/i18n/locales.ts`: `locales = ["es","en"]`, `defaultLocale = "es"`, `isLocale()`.
- `src/lib/i18n/get-dictionary.ts` carga `src/messages/{es,en}.ts` (tipado por `Dictionary`). Componentes reciben el diccionario por props (convención) o lo piden del layout.
- Cambiar textos = editar **los dos** archivos de mensajes (es y en).

### Pagos (Stripe + MercadoPago)
- `src/lib/billing.ts`: `TIER_RANK` (FREE<PRO<COLLECTOR), `PLAN_META` (precios fijos en USD, `priceEnvKey`), `getEnabledProviders()` (Stripe y/o MP según env), `priceIdForPlan`, `planFromPriceId`.
- `src/lib/payments.ts`: `checkoutUrl()` (por proveedor) y `portalUrl()`.
  - **Stripe**: checkout de suscripción (crea `Customer` en la primera compra, guarda `stripeCustomerId`); si ya hay suscripción ACTIVE → portal de cliente. El portal también se usa para gestionar una activa.
  - **MP**: crea un `preapproval` (guarda `mpPreapprovalId` antes de la autorización); NO hay portal de autogestión ("no_self_service").
- **Webhooks actualizan el plan** (única vía de cambiar plan de pago):
  - `POST /api/stripe/webhook` (firma `stripe-signature`, eventos: checkout.completed, subscription.updated, subscription.deleted, invoice.payment_failed). El plan se deriva de price ids reales + cross-check con metadata. **Guardia de rango**: nunca degrada un plan en curso.
  - `POST /api/mp/webhook` (firma HMAC `x-signature`; verifica el estado REAL de la preapproval consultando la API de MP). Autorizado → activa/degrafa con guardia; cancelado → FREE.
- Norma de seguridad a mantener: **nunca derivar el plan de inputs del cliente**; siempre del proveedor (price id / preapproval plan id) y contra BD.

### Subida de imágenes (`/api/games/upload`)
- Auth requerida, rate limited, `imageLimit > 0` obligatorio (403 `plan_required` si el plan no tiene fotos).
- Tipos permitidos: jpeg/png/webp, máx 2 MB.
- Con `BLOB_READ_WRITE_TOKEN` → `@vercel/blob` (`put` access public, URL https). Sin token (solo local) → `public/uploads/` (URL `/uploads/...`).
- El formulario de edición persiste la lista en `images` del PATCH (posición 0 = portada). `coverImageUrl` sigue siendo la portada de RAWG/manual (fallback si no hay `images`).

### Rate limiting (`src/lib/rate-limit.ts`)
Fixed-window en memoria por IP (`x-forwarded-for`/`x-real-ip`). Registro 30/h, verify 20/15min, checkout/portal 20/10min, games 120/h, uploads 60/h, admin 240/h. Respuesta `429` con `Retry-After: 900`. Es monojob: en despliegue serverless/horizontal migrar a Upstash/Redis.

### Health check
`GET /api/health` → `{ ok, users }` consultando la BD (para E2E y monitoreo).

---

## 6. UI y convenciones de componentes

### Wrappers de Base UI (shadcn v4)
`src/components/ui/*` son wrappers finos de Base UI. Botones con `buttonVariants({ variant, size })` (cva). **Antes de editar cualquier wrapper, mira los existentes.**

Gotchas críticos de Base UI 1.8.0 (de lo contrario la UI "funciona" pero las acciones no disparan):

- **NO existe `onSelect`** en items de menú (código muerto). Usar `onClick` (`MenuItem`, `closeOnClick` default `true`); `MenuCheckboxItem` → `onCheckedChange` (`closeOnClick` default `false`).
- **`render={<Link/>}` NO navega** en esta versión. Para navegar: item default (div) + `onClick={() => router.push(href)}`. Para logout: `render={<button type="button"/>}` + `onClick`. No anidar `<button>` dentro del item.
- **`SelectValue` muestra el valor crudo** (`OWNED`, `all`…), no el label. Fix: prop `itemToStringLabel={(value) => label...}` en el Root del `Select`. (Ver `edit-game-form.tsx` y `inventory-grid.tsx`.)
- Los diálogos (Dialog/AlertDialog) montan contenido vía Portal+Presence al abrir. Comprobación de apertura: presencia en DOM + `getBoundingClientRect()` (contenidos `position: fixed` → `offsetParent` es siempre `null`).
- Diálogos que viven dentro de un menú deben controlarse con estado arriba y montarse **fuera** del `DropdownMenuContent`, o se desmontan al re-renderizar.

### Theme
- `src/components/site/theme-provider.tsx`: ThemeProvider propio (drop-in de next-themes) + `useTheme` `{ theme, resolvedTheme, setTheme }`, storage key `"theme"`, `disableTransitionOnChange` con la clase `gv-no-transition` (definida en `globals.css`).
- El script anti-FOUC se inyecta con `useServerInsertedHTML` (fuera del árbol React) con la `nonce` del layout → compatible con la CSP strict-dynamic.
- **No volver a `next-themes`** (dependencia desinstalada; rompe warning de React 19).
- Tema con hydration mismatch → `suppressHydrationWarning` en el elemento afectado (patrón de next-themes). NO usar `setState` en un effect para un guard `mounted` (el lint `react-hooks/set-state-in-effect` lo rechaza).

### Footer/header
`SiteHeader`/`SiteFooter` en `src/components/site/`, `AuthNav` (menú de usuario + admin + logout), `LocaleSwitcher`, `ThemeToggle`.

---

## 7. Seguridad (CSP)

CSP estricta con nonce en `src/proxy.ts`: se genera un nonce por petición, se propaga como cabecera de request `x-nonce` (requisito del SSR dinámico de Next) y de respuesta.

- `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` solo en dev).
- `style-src 'self' 'unsafe-inline'` (sin nonce: con nonce + inline juntos la spec ignora `unsafe-inline`).
- `img-src 'self' data: blob: https:` (cubre imágenes de blob/RAWG/thumbnails), `connect-src 'self'`, `frame-src 'self' https://js.stripe.com https://hooks.stripe.com`.
- Headers: nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, HSTS (solo https).

Si un servicio de terceros necesita conectividad client-side (webhooks en front, widgets…), hay que abrir la CSP **intencionalmente** en `buildCsp`.

---

## 8. Referencia de endpoints de API

### Auth
| Método/Ruta | Descripción | Body/Query | Protección |
|---|---|---|---|
| `POST /api/auth/register` | Registro + envío de verificación | `{name?, email, password}` + `?locale=` | rate limit 30/h |
| `GET /api/auth/verify` | Verificar email | `?token=&email=` | rate limit 20/15min |
| `POST /api/auth/resend-verification` | Reenviar token | `{email}` | rate limit |
| `POST /api/auth/[...nextauth]` | NextAuth (login, callback…, Google) | — | provider |
| `GET/POST /api/auth/session` | Sesión actual (de Auth.js) | — | — |

### Juegos (usuario)
| Método/Ruta | Descripción | Protección |
|---|---|---|
| `GET /api/games` | Lista + `plan`, `limit`, `count` | sesión |
| `POST /api/games` | Crear juego (validation: título, plataforma, límite de plan) | sesión + rate limit |
| `PATCH /api/games/[id]` | Editar campos + imágenes/portada (respeta `imageLimit`) | sesión + dueño |
| `DELETE /api/games/[id]` | Borrar juego (propio) | sesión + dueño |
| `POST /api/games/upload` | Subir imagen (2MB, jpeg/png/webp) → url | sesión + `imageLimit>0` + rate limit |
| `GET /api/rawg/search?q=` | Buscar en RAWG | sesión |

### Admin (`requireAdmin()` — debe comprobar `guard.authorized` tras llamarlo)
| Método/Ruta | Descripción |
|---|---|
| `GET /api/admin/users?q=&page=&take=` | Lista usuarios con conteo de juegos |
| `PATCH /api/admin/users/[id]` | `{plan, role, ban}` |
| `GET /api/admin/games?q=&page=&take=` | Catálogo global |
| `DELETE /api/admin/games/[id]` | Borrar juego cualquiera |
| `GET/POST/PATCH/DELETE /api/admin/plans` | CRUD de planes (GET devuelve `userCount`) |
| `GET/POST /api/admin/platforms` | Lista/crea plataformas |
| `DELETE /api/admin/platforms/[id]` | Borra (Restrict si tiene juegos) |

### Billing
| Método/Ruta | Descripción |
|---|---|
| `POST /api/billing/checkout` | `{plan, provider, locale}` → `{url}` (Stripe checkout / MP preapproval) |
| `POST /api/billing/portal` | `{provider, locale}` → `{url}` (solo Stripe) |
| `POST /api/stripe/webhook` | Eventos de Stripe (firma) |
| `POST /api/mp/webhook` | Eventos de MP (firma HMAC) |

### Infra
`GET /api/health` → `{ ok, users }`.

---

## 9. Guías de modificación típicas

### Cambiar un texto de la UI
Editar `src/messages/es.ts` **y** `src/messages/en.ts` (misma clave). Nada más.

### Añadir una página autenticada
1. Crear `src/app/[lang]/app/<slug>/page.tsx` (Server Component) con `export const dynamic = "force-dynamic"`, `auth()`, `getDictionary()`, `isLocale(await lang())`.
2. El proxy ya protege `/app/**`; dentro, redirige a `/login` si `!session`.
3. Si necesita interactividad, un client component en `src/components/<area>/`.

### Añadir una ruta de API
1. Crear `src/app/api/.../route.ts` con `export const dynamic = "force-dynamic"`.
2. Proteger con `auth()` (usuario) o el patrón de `requireAdmin()`:
   ```ts
   const guard = await requireAdmin()
   if (!guard.authorized) return NextResponse.json(
     { error: guard.status === 403 ? "forbidden" : "unauthorized" },
     { status: guard.status })
   ```
   `requireAdmin()` devuelve un objeto, NO lanza.
3. Añadir rate limit si es sensible (auth, escritura).

### Añadir un campo a `Game`
1. `prisma/schema.prisma` → campo + migración.
2. Regenerar cliente (`npm run db:generate`).
3. `src/lib/game-summary.ts` para exponerlo a la UI, formularios/API routes como `src/app/api/games/[id]/route.ts`, y diccionarios si hay label.

### Añadir una plataforma
En `/admin/platforms` (admin UI), no en código. Opcionalmente seed en migración. `src/lib/platforms.ts` se encarga de slug/normalización y de mapear nombres de RAWG.

### Añadir un proveedor de pago (pattern)
1. Cliente SDK en `src/lib/<prov>.ts` (estilo `stripe.ts`/`mp.ts`).
2. `getEnabledProviders()` en `src/lib/billing.ts` + `is<Prov>Configured()`.
3. Rama en `checkoutUrl()`/`portalUrl()` de `src/lib/payments.ts`.
4. Webhook que actualice el plan con cross-check + guardia de rango.
5. Vars de entorno en `.env.example`.

---

## 10. Problemas y advertencias conocidas (no repetir)

El detalle completo está en `AGENTS.md` (sección "Bugs y lecciones ya corregidos"). Resumen rápido para quien toca código:

- **`onSelect` en Base UI no funciona** → `onClick` (ver §6).
- **`.next` corrupto tras reinstalar**: si `next dev` no levanta o HMR peta, borrar `.next` y reiniciar. No quitar los imports de fuentes del layout.
- **Después de un build roto, el navegador cachea bundles**: recargar con Ctrl+F5 en las pruebas manuales.
- **`requireAdmin()` no lanza** (ver §9).
- **Archivo `"use server"` solo exporta funciones async**: constantes de runtime en módulo normal (ej. `src/lib/i18n/locales.ts`).
- **Subir imágenes en Vercel**: el filesystem es efímero; usar Vercel Blob (lección 11 de AGENTS.md).
- **E2E con clicks sintéticos miente** (abren diálogos aunque el handler esté roto): para validar interactivos usar eventos de ratón reales.
- No hay test runner en el repo: la verificación es `npm run lint` + `npm run build`.

---

## 11. Índice de documentación

| Documento | Contenido |
|---|---|
| `README.md` | Esta guía técnica de desarrollo |
| [`MANUAL.md`](./MANUAL.md) | Manual de uso de la aplicación (end usuario) |
| [`AGENTS.md`](./AGENTS.md) | Reglas, gotchas y lecciones del repo (para agentes de IA) |
| [`.env.example`](./.env.example) | Variables de entorno documentadas |