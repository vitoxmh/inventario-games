-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('stripe', 'mp');

-- CreateTable
-- El interruptor del admin. La disponibilidad real del proveedor depende
-- ademas de sus variables de entorno: aqui solo se guarda la decision del
-- admin. La ausencia de fila significa "habilitado" (mismo comportamiento que
-- antes de existir esta tabla).
CREATE TABLE "PaymentProviderSetting" (
    "provider" "PaymentProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderSetting_pkey" PRIMARY KEY ("provider")
);

-- Seed: ambos proveedores empiezan habilitados.
INSERT INTO "PaymentProviderSetting" ("provider", "enabled", "createdAt", "updatedAt") VALUES
    ('stripe', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mp', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
