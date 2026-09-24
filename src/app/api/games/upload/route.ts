import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { auth } from "@/auth"
import { prisma, Plan } from "@/lib/db"
import { isPaidPlan } from "@/lib/plans"
import { isRateLimitedRequest, rateLimitJsonResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const MAX_SIZE = 2 * 1024 * 1024

// Cloudflare R2 (compatible S3). Solo se crea el cliente si la configuración
// está completa; en local sin R2 la subida cae al filesystem como fallback.
const r2AccountId = process.env.R2_ACCOUNT_ID
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const r2Bucket = process.env.R2_BUCKET_NAME
const r2PublicUrl = process.env.R2_PUBLIC_URL
const r2Enabled = Boolean(
  r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2PublicUrl,
)
const r2 = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId!,
        secretAccessKey: r2SecretAccessKey!,
      },
    })
  : null

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
  const plan = (dbUser?.plan ?? "FREE") as Plan
  if (!isPaidPlan(plan)) {
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
  // runtime, así que las imágenes van a Cloudflare R2 (URL absoluta https).
  if (r2) {
    const key = `uploads/${filename}`
    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: key,
          Body: buffer,
          ContentType: file.type,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      )
      const base = r2PublicUrl!.replace(/\/+$/, "")
      return NextResponse.json({ url: `${base}/${key}` }, { status: 201 })
    } catch (error) {
      console.error("[games/upload] error subiendo a Cloudflare R2:", error)
      return NextResponse.json({ error: "upload_failed" }, { status: 500 })
    }
  }

  // Local (sin variables R2): fallback al filesystem.
  const dir = join(process.cwd(), "public", "uploads")
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), buffer)

  return NextResponse.json({ url: `/uploads/${filename}` }, { status: 201 })
}