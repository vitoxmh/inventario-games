import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma, CollectionKind, GameParts, GameStatus } from "@/lib/db"
import { getImageLimit } from "@/lib/plans"
import { readGenreIds } from "@/lib/genre-input"
import { isConditionKey } from "@/lib/conditions"
import { readParts } from "@/lib/game-parts"
import { flatGenres } from "@/lib/game-summary"
import { isCollectionKind, kindRequiresPlatform } from "@/lib/kinds"
import { isValidImageUrl } from "@/lib/image-url"

export const dynamic = "force-dynamic"

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
    kind?: unknown
    platformId?: unknown
    genreIds?: unknown
    developer?: unknown
    publisher?: unknown
    series?: unknown
    volume?: unknown
    rating?: unknown
    status?: unknown
    playtimeMin?: unknown
    condition?: unknown
    parts?: unknown
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

  // `platformId` va plano a propósito: en `updateMany` la variante "checked" del
  // `data` no incluye las claves foráneas (ni aunque se escriban anidadas con
  // `connect`), así que la única forma válida de cambiar la plataforma es la
  // variante sin comprobar relaciones, que es la que acepta `platformId`.
  const data: {
    title?: string
    kind?: CollectionKind
    platformId?: string | null
    developer?: string | null
    publisher?: string | null
    series?: string | null
    volume?: number | null
    rating?: number | null
    status?: GameStatus
    playtimeMin?: number | null
    condition?: string | null
    parts?: GameParts[]
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

  // El tipo también es una allowlist del enum. Va antes que la plataforma
  // porque es lo que decide si la plataforma es obligatoria o se puede vaciar.
  let nextKind: CollectionKind | undefined
  if (body.kind !== undefined) {
    if (!isCollectionKind(body.kind)) {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 })
    }
    nextKind = body.kind
    data.kind = nextKind
  }

  if (body.platformId !== undefined) {
    const platformId = String(body.platformId ?? "").trim().slice(0, 100)
    if (!platformId) {
      // Vaciar la plataforma solo vale fuera de los juegos. Si el PATCH no trae
      // `kind`, se mira el actual para no exigir al cliente un dato que no
      // quiere cambiar.
      const current =
        nextKind !== undefined
          ? { kind: nextKind }
          : await prisma.game.findFirst({
              where: { id, userId: session.user.id },
              select: { kind: true },
            })
      if (!current) {
        return NextResponse.json({ error: "not_found" }, { status: 404 })
      }
      if (kindRequiresPlatform(current.kind)) {
        return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
      }
      data.platformId = null
    } else {
      const platform = await prisma.platform.findUnique({
        where: { id: platformId },
        select: { id: true },
      })
      if (!platform) {
        return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
      }
      data.platformId = platformId
    }
  } else if (nextKind !== undefined && kindRequiresPlatform(nextKind)) {
    // Cambiar a "juego" sin mandar plataforma: la fila tiene que tener ya una
    // válida, porque un juego sin plataforma no se puede pintar ni filtrar.
    const current = await prisma.game.findFirst({
      where: { id, userId: session.user.id },
      select: { platformId: true },
    })
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    if (!current.platformId) {
      return NextResponse.json({ error: "invalid_platform" }, { status: 400 })
    }
  }

  // Los géneros no entran en `data`: en `updateMany` la variante "checked" del
  // `data` no incluye las claves foráneas (ni aunque se escriban anidadas con
  // `connect`), así que el conjunto se reemplaza aparte, en la misma transacción
  // que el resto. `undefined` = no tocar; `[]` = dejar el juego sin género.
  let genreIds: string[] | undefined
  if (body.genreIds !== undefined) {
    const resolved = await readGenreIds(body.genreIds)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    genreIds = resolved.genreIds
  }

  if (body.developer !== undefined) {
    data.developer = String(body.developer ?? "").trim().slice(0, 160) || null
  }

  if (body.publisher !== undefined) {
    data.publisher = String(body.publisher ?? "").trim().slice(0, 160) || null
  }

  if (body.series !== undefined) {
    data.series = String(body.series ?? "").trim().slice(0, 160) || null
  }

  // El tomo es un entero opcional. `null`/"" lo vacían; un array u objeto no
  // pasa por número aunque `Number([])` sea 0, de ahí el `typeof` estricto.
  if (body.volume === undefined) {
    // No se toca.
  } else if (body.volume === null || body.volume === "") {
    data.volume = null
  } else if (
    typeof body.volume !== "number" &&
    typeof body.volume !== "string"
  ) {
    return NextResponse.json({ error: "invalid_volume" }, { status: 400 })
  } else {
    const volume = Number(body.volume)
    if (!Number.isInteger(volume) || volume < 0 || volume > 99999) {
      return NextResponse.json({ error: "invalid_volume" }, { status: 400 })
    }
    data.volume = volume
  }

  if (body.rating !== undefined && body.rating !== null && body.rating !== "") {
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "invalid_rating" }, { status: 400 })
    }
    data.rating = rating
  } else if (body.rating === null || body.rating === "") {
    data.rating = null
  }

  if (body.status !== undefined) {
    // `typeof` estricto, no `String(...)`: sin él un array de un elemento se
    // colaría como estado válido (`String(["OWNED"]) === "OWNED"`).
    if (typeof body.status !== "string" || !(body.status in GameStatus)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 })
    }
    data.status = body.status as GameStatus
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

  // El estado físico es una clave de la escalera cerrada de
  // `src/lib/conditions.ts`, no texto libre: la allowlist es la validación (400
  // `invalid_condition`), y `null`/"" lo vacían. Se compara el tipo antes de
  // validar porque `String(["GOOD"])` es "GOOD": un array no puede pasar por
  // "GOOD" solo por tener un elemento.
  if (body.condition !== undefined) {
    if (body.condition === null || body.condition === "") {
      data.condition = null
    } else if (
      typeof body.condition !== "string" ||
      !isConditionKey(body.condition)
    ) {
      return NextResponse.json({ error: "invalid_condition" }, { status: 400 })
    } else {
      data.condition = body.condition
    }
  }

  // Qué piezas le FALTAN a la copia. Es una lista de enum de Prisma
  // (`Game.parts`), así que tiene que llegar como array: `readParts` valida
  // elemento a elemento, quita duplicados y devuelve el orden canónico, o `null`
  // si no es una lista válida (de ahí el 400, sin dejar que un string o un array
  // con cualquier cosa llegue a la BD). `[]` la deja vacía, que es "no le falta
  // nada", y omitir el campo no lo toca.
  //
  // No se cruza con el estado a propósito: si el juego pasa a DIGITAL la
  // interfaz deja de mandar el campo, pero el valor guardado no se borra (es
  // información de la copia, y volver a ponerlo en físico la recupera).
  if (body.parts !== undefined) {
    const parts = body.parts === null ? [] : readParts(body.parts)
    if (!parts) {
      return NextResponse.json({ error: "invalid_parts" }, { status: 400 })
    }
    data.parts = parts
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

  // El manejo de imágenes (portada personalizada y galería) aplica a cualquier
  // plan con límite de imágenes > 0; se valida contra el plan en BD (autoritativo).
  let planMaxImages: number | null = null
  if (body.coverImageUrl !== undefined || body.images !== undefined) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    })
    const plan = dbUser?.plan ?? "FREE"
    planMaxImages = await getImageLimit(plan)
    if (planMaxImages <= 0) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }
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
      if (genreIds !== undefined) {
        await tx.gameGenre.deleteMany({ where: { gameId: id } })
        if (genreIds.length > 0) {
          await tx.gameGenre.createMany({
            data: genreIds.map((genreId) => ({ gameId: id, genreId })),
          })
        }
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
    include: {
      images: { orderBy: { position: "asc" } },
      genres: {
        select: { genre: { select: { id: true, slug: true, nameEs: true, nameEn: true } } },
      },
    },
  })
  // Puede haber desaparecido entre la transacción y esta relectura (borrado en
  // paralelo): se filtra siempre por propietario, así que `null` es un 404.
  if (!game) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  return NextResponse.json({ game: { ...game, ...flatGenres(game) } })
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