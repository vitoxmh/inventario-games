import "server-only"
import Stripe from "stripe"

export const stripe =
  process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2026-08-26.dahlia",
      })
    : null

export type StripeSubscriptionStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "TRIALING"

/*
 * Mapeo canónico del estado de una suscripción de Stripe al enum de la BD.
 * Vive aquí (y no duplicado en el webhook y en el flujo de upgrade) para que
 * ambos caminos escriban exactamente el mismo valor en `subscriptionStatus`.
 */
export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): StripeSubscriptionStatus | null {
  switch (status) {
    case "active":
      return "ACTIVE"
    case "past_due":
      return "PAST_DUE"
    case "canceled":
    case "unpaid":
      return "CANCELED"
    case "trialing":
      return "TRIALING"
    case "paused":
    case "incomplete":
    case "incomplete_expired":
      return "INACTIVE"
    default:
      return null
  }
}
