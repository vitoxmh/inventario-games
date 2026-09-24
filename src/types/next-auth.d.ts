import type { DefaultSession } from "next-auth"
import type { Plan } from "@/generated/prisma/enums"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      plan: Plan
      role: string
      banned: boolean
    } & DefaultSession["user"]
  }

  interface User {
    plan?: Plan
    role?: string
    banned?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    plan: Plan
    role: string
    banned: boolean
  }
}