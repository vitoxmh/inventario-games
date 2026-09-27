-- Historial de pagos: un cobro confirmado por proveedor, idempotente por
-- (provider, externalId) para que los reenvíos de webhook y la liquidación
-- repetida de la misma order de MP actualicen la fila en vez de duplicarla.
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_provider_externalId_key" ON "Payment"("provider", "externalId");
CREATE INDEX "Payment_userId_paidAt_idx" ON "Payment"("userId", "paidAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
