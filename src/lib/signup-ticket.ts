/*
 * Ticket stateless de "registro recién completado".
 *
 * El registro exige captcha, pero justo después el formulario hace
 * signIn("credentials") para no pedir la contraseña otra vez. Ese token de
 * Turnstile ya se consumió (es de un solo uso), así que el endpoint de
 * registro devuelve un ticket firmado con AUTH_SECRET (HMAC-SHA256) que
 * exime del captcha durante 2 minutos.
 *
 * NO es una sesión ni una credencial: sin él sigue haciendo falta la
 * contraseña (se verifica igual contra el hash). Solo evita repetir el reto
 * del captcha en el mismo flujo, y va atado al email del alta, de modo que
 * sirve para lo suyo y para nada más.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

const TICKET_TTL_MS = 2 * 60 * 1000
const MAX_TICKET_LENGTH = 512

type TicketPayload = { email: string; exp: number }

function secret(): string | null {
  return process.env.AUTH_SECRET || null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

export function createSignupTicket(email: string): string {
  const key = secret()
  if (!key) return ""
  const payload: TicketPayload = { email, exp: Date.now() + TICKET_TTL_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encoded}.${sign(encoded, key)}`
}

export function verifySignupTicket(ticket: unknown, email: string): boolean {
  const key = secret()
  if (!key) return false
  if (typeof ticket !== "string" || !ticket || ticket.length > MAX_TICKET_LENGTH) {
    return false
  }

  const [encoded, signature, extra] = ticket.split(".")
  if (!encoded || !signature || extra) return false

  const expected = sign(encoded, key)
  const given = Buffer.from(signature)
  const calculated = Buffer.from(expected)
  if (
    given.length !== calculated.length ||
    !timingSafeEqual(given, calculated)
  ) {
    return false
  }

  let payload: TicketPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    return false
  }

  return (
    typeof payload?.email === "string" &&
    typeof payload?.exp === "number" &&
    payload.email === email &&
    payload.exp > Date.now()
  )
}
