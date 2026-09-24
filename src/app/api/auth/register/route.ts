import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma, Prisma } from "@/lib/db"
import { sendVerificationEmail } from "@/lib/email"
import { isLocale } from "@/lib/i18n/locales"
import {
  isRateLimitedRequest,
  rateLimitJsonResponse,
} from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (
    isRateLimitedRequest(request, {
      prefix: "register",
      limit: 30,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  let body: { name?: string; email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const url = new URL(request.url)
  const locale = url.searchParams.get("locale")
  const currentLocale = locale && isLocale(locale) ? locale : "es"

  const name = String(body.name ?? "").trim().slice(0, 80)
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254)
  // Cap de longitud: evita que un atacante fuerce un hash bcrypt carísimo
  // con contraseñas de megabytes, además de curvas de memoria/hilo.
  const password = String(body.password ?? "").slice(0, 200)

  if (!email || !password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password_short" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  let userId: string
  try {
    const created = await prisma.user.create({
      data: { email, passwordHash, name: name || null },
      select: { id: true },
    })
    userId = created.id
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "email_in_use" }, { status: 409 })
    }
    console.error("register: error creando usuario:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }

  const token = randomBytes(32).toString("hex")

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  })

  const canSendEmail = Boolean(process.env.RESEND_API_KEY)
  let verified = !canSendEmail

  if (canSendEmail) {
    const origin = `${url.protocol}//${url.host}`
    const verificationUrl = `${origin}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`
    const sent = await sendVerificationEmail({
      to: email,
      locale: currentLocale,
      verificationUrl,
    })
    verified = !sent
  }

  if (verified) {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true, verified, id: userId })
}