import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin()
  if (!guard.authorized) {
    return NextResponse.json(
      { error: guard.status === 403 ? "forbidden" : "unauthorized" },
      { status: guard.status },
    )
  }

  const { id } = await context.params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const data: { plan?: string; role?: string; bannedAt?: Date | null } = {}

  if (body.plan !== undefined) {
    const plan = String(body.plan)
    const exists = await prisma.plan.findUnique({
      where: { slug: plan },
      select: { slug: true },
    })
    if (!exists) {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 })
    }
    data.plan = plan
  }

  if (body.role !== undefined) {
    const role = String(body.role)
    if (role !== "user" && role !== "admin") {
      return NextResponse.json({ error: "invalid_role" }, { status: 400 })
    }
    if (id === guard.user.id && role !== "admin") {
      return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 })
    }
    data.role = role
  }

  if (body.ban !== undefined) {
    data.bannedAt = Boolean(body.ban) ? new Date() : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 })
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
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
      },
    })
    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
}