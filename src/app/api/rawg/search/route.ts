import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { searchRawgGames } from "@/lib/rawg"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") ?? ""

  if (q.length > 100) {
    return NextResponse.json({ results: [] })
  }
  if (q.trim().length < 3) {
    return NextResponse.json({ results: [] })
  }

  const results = await searchRawgGames(q)
  return NextResponse.json({ results })
}