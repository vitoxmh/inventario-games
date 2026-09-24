import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

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

  const result = await prisma.game.deleteMany({ where: { id } })
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}