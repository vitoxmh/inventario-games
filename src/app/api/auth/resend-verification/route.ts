import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/db"
import { sendVerificationEmail } from "@/lib/email"
import {
  isRateLimitedRequest,
  rateLimitJsonResponse,
} from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (
    isRateLimitedRequest(request, {
      prefix: "resend",
      limit: 5,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { email?: string; locale?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254)
  const locale = body.locale === "en" ? "en" : "es"

  if (!email) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  })

  if (!user || user.emailVerifiedAt) {
    return NextResponse.json({ ok: true })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true })
  }

  await prisma.verificationToken.deleteMany({ where: { identifier: email } })

  const token = randomBytes(32).toString("hex")
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  })

  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  await sendVerificationEmail({
    to: email,
    locale,
    verificationUrl: `${origin}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`,
  })

  return NextResponse.json({ ok: true })
}