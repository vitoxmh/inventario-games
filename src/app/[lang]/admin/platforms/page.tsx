import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { AdminPlatformsClient } from "@/components/admin/admin-platforms-client"
import { getDictionary } from "@/lib/i18n/get-dictionary"

export const metadata: Metadata = {
  title: "Plataformas",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminPlatformsPage() {
  const dict = await getDictionary()

  const platforms = await prisma.platform.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { games: true } },
    },
  })

  return (
    <AdminPlatformsClient
      initialPlatforms={platforms.map((platform) => ({
        id: platform.id,
        name: platform.name,
        slug: platform.slug,
        gameCount: platform._count.games,
      }))}
      dict={dict.admin}
    />
  )
}