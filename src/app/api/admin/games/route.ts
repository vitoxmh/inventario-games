import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Prisma } from "@/lib/db"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return NextResponse.json(
      { error: guard.status === 403 ? "forbidden" : "unauthorized" },
      { status: guard.status },
    )
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "admin",
      limit: 240,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? 20) || 20))

  const where: Prisma.GameWhereInput = {}
  if (q) where.title = { contains: q, mode: "insensitive" }

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        title: true,
        platform: { select: { name: true } },
        genre: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.game.count({ where }),
  ])

  return NextResponse.json({
    games: games.map((game) => ({
      ...game,
      platform: game.platform.name,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
  })
}