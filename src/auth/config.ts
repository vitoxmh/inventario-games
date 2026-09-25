import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { ADMIN_EMAILS } from "@/lib/admin-emails"
import { getClientIp } from "@/lib/rate-limit"
import { verifySignupTicket } from "@/lib/signup-ticket"
import { verifyTurnstileToken } from "@/lib/turnstile"

const hasGoogle = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
)

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    ...(hasGoogle
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        captchaToken: { label: "Captcha", type: "text" },
        signupTicket: { label: "Signup ticket", type: "text" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase()
        const password = String(credentials?.password ?? "").slice(0, 200)

        if (!email || !password) return null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null

        // Turnstile antes de tocar la BD ni comparar contraseñas. Se exime solo
        // con un ticket de alta válido para este email (el registro ya pasó el
        // captcha y el token de un solo uso ya se consumió ahí).
        if (!verifySignupTicket(credentials?.signupTicket, email)) {
          const captcha = await verifyTurnstileToken({
            token: credentials?.captchaToken,
            remoteIp: getClientIp(request),
          })
          if (!captcha.ok) {
            // Mismo `null` que una contraseña incorrecta: no se le dice al
            // atacante qué capa falló (el detalle va al log del servidor).
            console.warn("[auth] login rechazado por captcha:", captcha.reason)
            return null
          }
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null
        if (!user.emailVerifiedAt) return null
        if (user.bannedAt) return null

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.imageUrl,
          plan: user.plan,
          role: user.role,
          banned: Boolean(user.bannedAt),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const id = (token.id ?? user?.id) as string | undefined
      if (!id) return token

      const dbUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, plan: true, role: true, bannedAt: true },
      })

      if (dbUser) {
        token.id = dbUser.id
        token.plan = dbUser.plan
        token.role = dbUser.role
        token.banned = dbUser.bannedAt != null
      } else if (user?.id) {
        token.id = user.id
        token.plan = (user.plan as string | undefined) ?? "FREE"
        token.role = (user.role as string | undefined) ?? "user"
        token.banned = (user as { banned?: boolean }).banned ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.plan = (token.plan as string | undefined) ?? "FREE"
        session.user.role = (token.role as string | undefined) ?? "user"
        session.user.banned = Boolean(token.banned)
      }
      return session
    },
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase()
        const existing = await prisma.user.findUnique({ where: { email } })

        if (existing) {
          user.id = existing.id
          user.name = user.name ?? existing.name
          user.image = user.image ?? existing.imageUrl
        } else {
          const created = await prisma.user.create({
            data: {
              email,
              name: user.name,
              imageUrl: user.image,
              emailVerifiedAt: new Date(),
            },
            select: { id: true },
          })
          user.id = created.id
        }
      }

      const id = user?.id as string | undefined
      if (!id) return true

      const dbUser = await prisma.user.findUnique({
        where: { id },
        select: { email: true, role: true, bannedAt: true },
      })
      if (dbUser?.bannedAt) return false

      if (
        dbUser?.role !== "admin" &&
        ADMIN_EMAILS.includes((dbUser?.email ?? user.email ?? "").toLowerCase())
      ) {
        await prisma.user.update({
          where: { id },
          data: { role: "admin" },
          select: { id: true },
        })
      }
      return true
    },
  },
} satisfies NextAuthConfig