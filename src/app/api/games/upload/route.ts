import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { put } from "@vercel/blob"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { getImageLimit } from "@/lib/plans"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const MAX_SIZE = 2 * 1024 * 1024

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    isRateLimitedRequest(request, {
      prefix: "uploads",
      limit: 60,
      windowMs: 60 * 60 * 1000,
    })
  ) {
    return rateLimitJsonResponse()
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  })
  const plan = dbUser?.plan ?? "FREE"
  const imageLimit = await getImageLimit(plan)
  if (imageLimit <= 0) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 })
  }

  const ext = MIME_EXT[file.type]
  if (!ext) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const filename = `${randomBytes(16).toString("hex")}.${ext}`

  // Producción: el filesystem de Vercel es efímero y `public/` es inmutable en
  // runtime, así que las imágenes van a Vercel Blob (URL absoluta https).
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    try {
      const blob = await put(`uploads/${filename}`, buffer, {
        access: "public",
        token: blobToken,
      })
      return NextResponse.json({ url: blob.url }, { status: 201 })
    } catch (error) {
      console.error("[games/upload] error subiendo a Vercel Blob:", error)
      return NextResponse.json({ error: "upload_failed" }, { status: 500 })
    }
  }

  // Local (sin BLOB_READ_WRITE_TOKEN): fallback al filesystem.
  const dir = join(process.cwd(), "public", "uploads")
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), buffer)

  return NextResponse.json({ url: `/uploads/${filename}` }, { status: 201 })
}