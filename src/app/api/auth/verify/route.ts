import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  isRateLimitedRequest,
  rateLimitJsonResponse,
} from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (
    isRateLimitedRequest(request, {
      prefix: "verify",
      limit: 20,
      windowMs: 15 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  const url = new URL(request.url)
  const token = url.searchParams.get("token") ?? ""
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase()

  const defaultLocale = (() => {
    const accept = request.headers.get("accept-language") ?? ""
    return accept.toLowerCase().startsWith("en") ? "en" : "es"
  })()

  if (token.length > 128 || email.length > 254) {
    return NextResponse.redirect(
      new URL(`/${defaultLocale}/login?error=invalid_token`, url.origin),
    )
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  })

  if (!record || record.identifier !== email || record.expires < new Date()) {
    return NextResponse.redirect(
      new URL(
        `/${defaultLocale}/login?error=invalid_token`,
        url.origin,
      ),
    )
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ])

  return NextResponse.redirect(
    new URL(
      `/${defaultLocale}/login?verified=1`,
      url.origin,
    ),
  )
}