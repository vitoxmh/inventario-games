import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "node:crypto"
import { getToken } from "next-auth/jwt"
import {
  defaultLocale,
  isLocale,
  locales,
  type Locale,
} from "@/lib/i18n/locales"

function getLocale(request: NextRequest): Locale {
  const header = request.headers.get("accept-language") ?? ""
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase()
    if (isLocale(tag)) return tag
  }
  return defaultLocale
}

/*
 * CSP estricta con nonces. Requiere SSR dinámico: Next aplica el nonce a
 * los scripts en línea leyendo la cabecera de petición `x-nonce` que
 * inyectamos aquí (ver docs de Next, patrón middleware/proxy). Con
 * 'strict-dynamic' los scripts de primer nivel amplían el permiso a sus
 * dependencias sin listar cada chunk.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    // Sin nonce en style-src: si confluyen 'unsafe-inline' + nonce la spec
    // ignora 'unsafe-inline' y bloquea todo estilo inline en runtime (sonner,
    // next-themes, posicionadores Base UI). El nonce aquí no aporta nada.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

function withSecurityHeaders(
  response: NextResponse,
  nonce: string,
  isHttps: boolean,
): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce))
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  )
  if (isHttps) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    )
  }
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const nonce = randomBytes(18).toString("base64")
  // Next extrae la nonce para sus scripts de la cabecera CSP presente en la
  // petición; por eso se propaga también en los request headers (no solo en
  // la respuesta), tal y como exige el patrón documentado de nonces.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", buildCsp(nonce))
  const isHttps = request.nextUrl.protocol === "https:"

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  )

  if (!pathnameHasLocale) {
    const locale = getLocale(request)
    request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`
    return withSecurityHeaders(
      NextResponse.redirect(request.nextUrl),
      nonce,
      isHttps,
    )
  }

  const appMatch = /^\/(es|en)\/app(?:\/|$)/.exec(pathname)
  if (appMatch) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      // En HTTPS Auth.js usa el prefijo `__Secure-` para la cookie de sesión
      // (useSecureCookies se deriva de url.protocol === "https:"). Sin esto,
      // getToken busca "authjs.session-token" y no la encuentra en Vercel,
      // provocando el bucle de redirección a /login aunque la sesión exista.
      secureCookie: request.nextUrl.protocol === "https:",
    })
    if (!token) {
      const url = request.nextUrl.clone()
      url.pathname = `/${appMatch[1]}/login`
      url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`
      return withSecurityHeaders(
        NextResponse.redirect(url),
        nonce,
        isHttps,
      )
    }
  }

  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
    isHttps,
  )
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}