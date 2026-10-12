import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/guard"
import { prisma, Prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

function readName(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null
  return value.trim().slice(0, limit) || null
}

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

  let body: { nameEs?: unknown; nameEn?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const nameEs = readName(body.nameEs, 100)
  const nameEn = readName(body.nameEn, 100)
  if (!nameEs || !nameEn) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  // A diferencia de la alta, aquí el `slug` no se toca: es la clave estable que
  // usan el matcher de sinónimos y el backfill de las migraciones.
  try {
    const genre = await prisma.genre.update({
      where: { id },
      data: { nameEs, nameEn },
      select: { id: true, slug: true, nameEs: true, nameEn: true, sortOrder: true },
    })
    return NextResponse.json({ genre })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    console.error("[admin/genres] error renombrando género:", error)
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

  const genre = await prisma.genre.findUnique({
    where: { id },
    select: { id: true, _count: { select: { games: true } } },
  })
  if (!genre) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // A diferencia de `Platform`, borrar un género en uso no se bloquea: la tabla
  // puente está en `Cascade`, así que los juegos se quedan sin ese género y
  // conservan el resto de la ficha (los otros géneros que tuvieran, la
  // plataforma, las fotos…). Es el mismo resultado que editar el juego y
  // quitarle el género, pero en un paso.
  await prisma.genre.delete({ where: { id } })
  return NextResponse.json({ ok: true, detached: genre._count.games })
}
