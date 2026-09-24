import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma } from "@/lib/db"
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

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        bannedAt: true,
        emailVerifiedAt: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { games: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    users,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
  })
}