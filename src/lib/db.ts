import "server-only"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@/generated/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export { Prisma } from "@/generated/prisma/client"
export { Plan, GameStatus, SubscriptionStatus } from "@/generated/prisma/enums"
export type {
  Game,
  User,
  Account,
  Session,
  VerificationToken,
} from "@/generated/prisma/client"