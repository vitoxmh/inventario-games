import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const users = await prisma.user.count()
    return NextResponse.json({ ok: true, users })
  } catch (error) {
    console.error("Health check DB failed:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    )
  }
}