import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma, GameStatus } from "@/lib/db"
import { getImageLimit, isPaidPlan } from "@/lib/plans"

export const dynamic = "force-dynamic"

function isValidImageUrl(value: string): boolean {
  if (value.startsWith("/uploads/")) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  let body: {
    title?: unknown
    platformId?: unknown
    genre?: unknown
    status?: unknown
    playtimeMin?: unknown
    condition?: unknown
    purchasePrice?: unknown
    purchaseDate?: unknown
    notes?: unknown
    coverImageUrl?: unknown
    images?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const data: {
    title?: string
    platformId?: string
    genre?: string | null
    status?: GameStatus
    playtimeMin?: number | null
    condition?: string | null
    purchasePrice?: number | null
    purchaseDate?: Date | null
    notes?: string | null
    coverImageUrl?: string | null
  } = {}

  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim().slice(0, 200)
    if (!title) {
      return NextResponse.json({ error: "invalid_title" }, { status: 400 })
    }
    data.title = title
  }

  if (body.platformId !== undefined) {
    const platformId = String(body.platformId ?? "").trim().slice(0, 100)
    if (!platformId) {
      return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
    }
    const platform = await prisma.platform.findUnique({
      where: { id: platformId },
      select: { id: true },
    })
    if (!platform) {
      return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
    }
    data.platformId = platformId
  }

  if (body.genre !== undefined) {
    data.genre = String(body.genre ?? "").trim().slice(0, 120) || null
  }

  if (body.status !== undefined) {
    const status = String(body.status)
    if (!(status in GameStatus)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }
    data.status = status as GameStatus
  }

  if (
    body.playtimeMin !== undefined &&
    body.playtimeMin !== null &&
    body.playtimeMin !== ""
  ) {
    const playtime = Number(body.playtimeMin)
    if (!Number.isInteger(playtime) || playtime < 0) {
      return NextResponse.json({ error: "invalid_playtime" }, { status: 400 })
    }
    data.playtimeMin = playtime
  } else if (body.playtimeMin === null || body.playtimeMin === "") {
    data.playtimeMin = null
  }

  if (body.condition !== undefined) {
    const condition = String(body.condition ?? "").trim().slice(0, 60)
    data.condition = condition || null
  }

  if (body.purchasePrice !== undefined && body.purchasePrice !== null) {
    const price = Number(body.purchasePrice)
    if (!Number.isFinite(price) || price < 0 || price > 999999.99) {
      return NextResponse.json({ error: "invalid_price" }, { status: 400 })
    }
    data.purchasePrice = Math.round(price * 100) / 100
  } else if (body.purchasePrice === null || body.purchasePrice === "") {
    data.purchasePrice = null
  }

  if (body.purchaseDate !== undefined && body.purchaseDate !== null) {
    const date = new Date(String(body.purchaseDate))
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 })
    }
    data.purchaseDate = date
  } else if (body.purchaseDate === null || body.purchaseDate === "") {
    data.purchaseDate = null
  }

  if (body.notes !== undefined) {
    data.notes = String(body.notes ?? "").trim().slice(0, 2000) || null
  }

  // El manejo de imágenes (portada personalizada y galería) es exclusivo de
  // los planes de pago; se valida contra el plan en BD (autoritativo).
  let planMaxImages: number | null = null
  if (body.coverImageUrl !== undefined || body.images !== undefined) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    })
    const plan = dbUser?.plan ?? "FREE"
    if (!(await isPaidPlan(plan))) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }
    planMaxImages = await getImageLimit(plan)
  }

  if (body.coverImageUrl !== undefined) {
    const value = String(body.coverImageUrl ?? "").trim().slice(0, 1000)
    if (value !== "" && !isValidImageUrl(value)) {
      return NextResponse.json({ error: "invalid_image_url" }, { status: 400 })
    }
    data.coverImageUrl = value === "" ? null : value
  }

  let images: string[] | undefined
  if (body.images !== undefined) {
    const raws = Array.isArray(body.images) ? body.images : []
    const list: string[] = []
    for (const raw of raws) {
      const value = String(raw ?? "").trim().slice(0, 1000)
      if (value === "") continue
      if (!isValidImageUrl(value)) {
        return NextResponse.json({ error: "invalid_image_url" }, { status: 400 })
      }
      list.push(value)
    }
    if (list.length > (planMaxImages ?? 0)) {
      return NextResponse.json({ error: "max_images" }, { status: 400 })
    }
    images = list
  }

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.game.updateMany({
        where: { id, userId: session.user.id },
        data,
      })
      if (result.count === 0) {
        throw new Error("not_found")
      }
      if (images !== undefined) {
        await tx.gameImage.deleteMany({ where: { gameId: id } })
        if (images.length > 0) {
          await tx.gameImage.createMany({
            data: images.map((url, position) => ({ gameId: id, url, position })),
          })
        }
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    console.error("[games] error actualizando juego:", error)
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }

  const game = await prisma.game.findFirst({
    where: { id, userId: session.user.id },
    include: { images: { orderBy: { position: "asc" } } },
  })
  return NextResponse.json({ game })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const result = await prisma.game.deleteMany({
    where: { id, userId: session.user.id },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}