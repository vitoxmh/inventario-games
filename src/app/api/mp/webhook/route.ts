import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  getMpPreapproval,
  verifyMpSignature,
  mpPlanFromPreapprovalPlanId,
} from "@/lib/mp"
import { TIER_RANK } from "@/lib/billing"

export const dynamic = "force-dynamic"

/*
 * Webhook de Mercado Pago (tipo `subscription_preapproval`).
 * Seguridad:
 *  - Firma HMAC: `x-signature` + `x-request-id` verificados contra
 *    `MP_WEBHOOK_SECRET`. Si no hay secret configurado, el webhook no
 *    procesa nada (el proveedor está "desactivado").
 *  - Cross-check: nunca se confía en el estado del evento; se pregunta a la
 *    API de MP el estado REAL de la preapproval antes de mutar la BD.
 *  - El plan se deriva del `preapproval_plan_id` real contra nuestras vars.
 *  - Guardia de rango en "authorized": jamás degradamos un plan activo.
 *  - Idempotente: repetir el mismo evento converje al mismo estado.
 */

type PreapprovalStatus = "ACTIVE" | "CANCELED" | "INACTIVE" | "PAST_DUE"

function mapMpStatus(
  status: string | undefined,
  paid: boolean,
): PreapprovalStatus | null {
  switch (status) {
    case "authorized":
      return paid ? "ACTIVE" : "PAST_DUE"
    case "paused":
    case "pending":
      return "INACTIVE"
    case "cancelled":
      return "CANCELED"
    default:
      return null
  }
}

export async function POST(request: Request) {
  if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "mp_not_configured" },
      { status: 503 },
    )
  }

  const url = new URL(request.url)
  const type = url.searchParams.get("type")
  const dataId = url.searchParams.get("data.id") ?? ""

  // Protección de entrada: tipos no relacionados se ignoran sin procesar.
  if (type !== "subscription_preapproval" && type !== "subscription_plan") {
    return NextResponse.json({ received: true })
  }
  if (!dataId) {
    return NextResponse.json({ received: true })
  }

  if (!verifyMpSignature(request, dataId)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  let preapproval
  try {
    preapproval = await getMpPreapproval(dataId)
  } catch (error) {
    console.error("[mp:webhook] error consultando preapproval:", error)
    return NextResponse.json(
      { error: "preapproval_lookup_failed" },
      { status: 502 },
    )
  }
  if (!preapproval) {
    return NextResponse.json(
      { error: "preapproval_not_found" },
      { status: 404 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { mpPreapprovalId: preapproval.id },
  })

  // Si no existe usuario para esa preapproval, puede ser un evento sobre
  // una preapproval externa (spam/error). Se ignora silenciosamente pero se
  // contesta 200 para no perpetuar reintentos.
  if (!user) {
    return NextResponse.json({ received: true })
  }

  const plan = mpPlanFromPreapprovalPlanId(preapproval.preapproval_plan_id)
  const status = mapMpStatus(
    preapproval.status,
    preapproval.status === "authorized",
  )

  if (!status) {
    console.error(
      "[mp:webhook] estado no reconocido:",
      preapproval.status,
    )
    return NextResponse.json({ received: true })
  }

  if (status === "ACTIVE") {
    // El plan debe ser válido y no debe degradar al usuario.
    if (!plan || TIER_RANK[plan] < TIER_RANK[user.plan]) {
      return NextResponse.json({ received: true })
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        subscriptionStatus: "ACTIVE",
        mpPreapprovalId: preapproval.id,
        mpPreapprovalPlanId: preapproval.preapproval_plan_id ?? null,
      },
    })
    return NextResponse.json({ received: true })
  }

  if (status === "CANCELED") {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: "FREE",
        subscriptionStatus: "CANCELED",
        mpPreapprovalId: null,
        mpPreapprovalPlanId: null,
      },
    })
    return NextResponse.json({ received: true })
  }

  // Paused/pending → INACTIVE: degradado a FREE mientras dure la pausa.
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: status },
  })

  return NextResponse.json({ received: true })
}