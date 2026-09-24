import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { ADMIN_EMAILS } from "@/lib/admin-emails"

export { ADMIN_EMAILS }

export type GuardUser = {
  id: string
  email: string
  role: string
  bannedAt: Date | null
}

export type AdminGuard =
  | { authorized: true; user: GuardUser }
  | { authorized: false; status: 401 | 403 }

export async function getUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, bannedAt: true },
  })
}

export async function promoteByEnv(user: GuardUser): Promise<GuardUser> {
  if (
    user.role !== "admin" &&
    ADMIN_EMAILS.length > 0 &&
    ADMIN_EMAILS.includes(user.email.toLowerCase())
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "admin" },
      select: { id: true },
    })
    user.role = "admin"
  }
  return user
}

/**
 * Autoriza una petición de administrador leyendo el rol desde BD
 * (autoritativo) y promoviendo admins listados en ADMIN_EMAILS.
 */
export async function requireAdmin(): Promise<AdminGuard> {
  const session = await auth()
  if (!session?.user?.id) return { authorized: false, status: 401 }
  const dbUser = await getUser(session.user.id)
  if (!dbUser || dbUser.bannedAt) return { authorized: false, status: 403 }
  const promoted = await promoteByEnv(dbUser)
  if (promoted.role !== "admin") return { authorized: false, status: 403 }
  return { authorized: true, user: promoted }
}