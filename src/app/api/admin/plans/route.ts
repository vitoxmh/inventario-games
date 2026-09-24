import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Prisma } from "@/lib/db"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const MAX_IMAGE_LIMIT = 20
const MAX_GAME_LIMIT = 1000000
const MAX_ORDER = 1000

const planSelect = {
  slug: true,
  nameEs: true,
  nameEn: true,
  gameLimit: true,
  imageLimit: true,
  paid: true,
  active: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const

function normalizeSlug(value: unknown): string | null {
  const slug = String(value ?? "").trim().toUpperCase()
  if (!slug || slug.length > 40 || !/^[A-Z0-9_-]+$/.test(slug)) return null
  return slug
}

function parseName(value: unknown): string | null {
  const name = String(value ?? "").trim().slice(0, 60)
  return name || null
}

// Límite de juegos: número entero >= 0, cadena vacía/undefined/null = ilimitado.
function parseGameLimit(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > MAX_GAME_LIMIT) return "invalid"
  return n
}

function parseImageLimit(value: unknown): number | "invalid" {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > MAX_IMAGE_LIMIT) return "invalid"
  return n
}

function parseSortOrder(value: unknown): number {
  const n = Number(value)
  if (!Number.isInteger(n)) return 0
  return Math.min(MAX_ORDER, Math.max(0, n))
}

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

  const [plans, counts] = await Promise.all([
    prisma.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      select: planSelect,
    }),
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
  ])
  const usersByPlan = new Map(counts.map((row) => [row.plan, row._count._all]))

  return NextResponse.json({
    plans: plans.map((plan) => ({
      ...plan,
      userCount: usersByPlan.get(plan.slug) ?? 0,
    })),
  })
}

export async function POST(request: Request) {
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

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const slug = normalizeSlug(body.slug)
  if (!slug) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 })
  }
  const nameEs = parseName(body.nameEs)
  if (!nameEs) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }
  const nameEn = parseName(body.nameEn) ?? nameEs
  const gameLimit = parseGameLimit(body.gameLimit)
  if (gameLimit === "invalid") {
    return NextResponse.json({ error: "invalid_game_limit" }, { status: 400 })
  }
  const imageLimit = parseImageLimit(body.imageLimit)
  if (imageLimit === "invalid") {
    return NextResponse.json({ error: "invalid_image_limit" }, { status: 400 })
  }
  const active = body.active === undefined ? true : Boolean(body.active)
  const sortOrder = parseSortOrder(body.sortOrder)

  try {
    const plan = await prisma.plan.create({
      data: { slug, nameEs, nameEn, gameLimit, imageLimit, active, sortOrder },
      select: planSelect,
    })
    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "slug_in_use" }, { status: 409 })
    }
    console.error("[admin/plans] error creando plan:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
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

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const slug = String(body.slug ?? "").trim()
  const existing = await prisma.plan.findUnique({
    where: { slug },
    select: { slug: true },
  })
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const data: {
    nameEs?: string
    nameEn?: string
    gameLimit?: number | null
    imageLimit?: number
    active?: boolean
    sortOrder?: number
  } = {}

  if (body.nameEs !== undefined) {
    const nameEs = parseName(body.nameEs)
    if (!nameEs) return NextResponse.json({ error: "invalid_name" }, { status: 400 })
    data.nameEs = nameEs
  }
  if (body.nameEn !== undefined) {
    const nameEn = parseName(body.nameEn)
    if (!nameEn) return NextResponse.json({ error: "invalid_name" }, { status: 400 })
    data.nameEn = nameEn
  }
  if (body.gameLimit !== undefined) {
    const gameLimit = parseGameLimit(body.gameLimit)
    if (gameLimit === "invalid") {
      return NextResponse.json({ error: "invalid_game_limit" }, { status: 400 })
    }
    data.gameLimit = gameLimit
  }
  if (body.imageLimit !== undefined) {
    const imageLimit = parseImageLimit(body.imageLimit)
    if (imageLimit === "invalid") {
      return NextResponse.json({ error: "invalid_image_limit" }, { status: 400 })
    }
    data.imageLimit = imageLimit
  }
  if (body.active !== undefined) {
    data.active = Boolean(body.active)
  }
  if (body.sortOrder !== undefined) {
    data.sortOrder = parseSortOrder(body.sortOrder)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 })
  }

  try {
    const plan = await prisma.plan.update({
      where: { slug },
      data,
      select: planSelect,
    })
    return NextResponse.json({ plan })
  } catch (error) {
    console.error("[admin/plans] error actualizando plan:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return NextResponse.json(
      { error: guard.status === 403 ? "forbidden" : "unauthorized" },
      { status: guard.status },
    )
  }

  let body: { slug?: unknown }
  try {
    body = (await request.json()) as { slug?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const slug = String(body.slug ?? "").trim()
  const existing = await prisma.plan.findUnique({
    where: { slug },
    select: { slug: true },
  })
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const users = await prisma.user.count({ where: { plan: slug } })
  if (users > 0) {
    return NextResponse.json({ error: "plan_in_use" }, { status: 409 })
  }

  await prisma.plan.delete({ where: { slug } })
  return NextResponse.json({ ok: true })
}