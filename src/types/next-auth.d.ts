import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      plan: string
      role: string
      banned: boolean
    } & DefaultSession["user"]
  }

  interface User {
    plan?: string
    role?: string
    banned?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    plan: string
    role: string
    banned: boolean
  }
}