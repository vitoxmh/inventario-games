import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Prisma } from "@/lib/db"
import { slugifyPlatform } from "@/lib/platforms"

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

  let body: { name?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const name = String(body.name ?? "").trim().slice(0, 100)
  if (!name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  try {
    const platform = await prisma.platform.update({
      where: { id },
      data: { name, slug: slugifyPlatform(name) },
      select: { id: true, name: true, slug: true },
    })
    return NextResponse.json({ platform })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "name_in_use" }, { status: 409 })
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    console.error("[admin/platforms] error renombrando plataforma:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
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

  const platform = await prisma.platform.findUnique({
    where: { id },
    select: { id: true, _count: { select: { games: true } } },
  })
  if (!platform) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (platform._count.games > 0) {
    return NextResponse.json({ error: "platform_in_use" }, { status: 409 })
  }

  await prisma.platform.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}