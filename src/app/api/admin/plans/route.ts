import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Plan } from "@/lib/db"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"
import { DEFAULT_IMAGE_LIMITS } from "@/lib/plans"

export const dynamic = "force-dynamic"

const MAX_IMAGE_LIMIT = 20

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

  const rows = await prisma.planConfig.findMany({
    select: { plan: true, imageLimit: true },
  })
  const byPlan = new Map(rows.map((r) => [r.plan, r.imageLimit]))
  const planKeys = Object.keys(Plan) as Array<keyof typeof Plan>
  const configs = planKeys.map((plan) => ({
    plan,
    imageLimit: byPlan.get(plan) ?? DEFAULT_IMAGE_LIMITS[plan] ?? 1,
  }))

  return NextResponse.json({ configs })
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

  let body: { plan?: unknown; imageLimit?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const plan = String(body.plan ?? "")
  const imageLimit = Number(body.imageLimit)
  if (!plan || !(plan in Plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 })
  }
  if (
    !Number.isInteger(imageLimit) ||
    imageLimit < 0 ||
    imageLimit > MAX_IMAGE_LIMIT
  ) {
    return NextResponse.json({ error: "invalid_image_limit" }, { status: 400 })
  }

  try {
    const config = await prisma.planConfig.upsert({
      where: { plan: plan as Plan },
      update: { imageLimit },
      create: { plan: plan as Plan, imageLimit },
      select: { plan: true, imageLimit: true },
    })
    return NextResponse.json({ config })
  } catch (error) {
    console.error("[admin/plans] error actualizando plan:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}