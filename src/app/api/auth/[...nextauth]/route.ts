import { handlers } from "@/auth"
import type { NextRequest } from "next/server"
import {
  isRateLimitedRequest,
  rateLimitJsonResponse,
} from "@/lib/rate-limit"

export const { GET } = handlers

export async function POST(request: Request) {
  const url = new URL(request.url)
  // Solo el flujo de credenciales es susceptible de fuerza bruta; los
  // providers OAuth delegan la autenticación en el proveedor externo.
  if (url.pathname.endsWith("/callback/credentials")) {
    if (
      isRateLimitedRequest(request, {
        prefix: "credentials",
        limit: 10,
        windowMs: 15 * 60 * 1000,
      })
    ) {
      return rateLimitJsonResponse()
    }
  }
  return handlers.POST(request as NextRequest)
}