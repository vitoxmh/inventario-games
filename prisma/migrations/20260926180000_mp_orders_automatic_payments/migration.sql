-- Migración de Mercado Pago: de las Suscripciones (/preapproval, legacy) a la
-- Checkout API / Automatic Payments (Orders + payment profiles).
--
-- Lo que se borra (`mpPreapprovalId`, `mpPreapprovalPlanId`) identificaba una
-- suscripción del servicio de Suscripciones de MP, que ya no se usa. Lo que
-- aparece es el estado del modelo actual: el customer de MP, el payment profile
-- que guarda la tarjeta, y los datos que hacen falta para cobrar los ciclos
-- siguientes y para no hacerlo dos veces.

-- AlterTable: nuevos campos de Orders / Automatic Payments
ALTER TABLE "User" ADD COLUMN     "mpCustomerId" TEXT,
ADD COLUMN     "mpPaymentProfileId" TEXT,
ADD COLUMN     "mpPaymentProfileStatus" TEXT,
ADD COLUMN     "mpPaymentMethodId" TEXT,
ADD COLUMN     "mpLastPaymentReferenceId" TEXT,
ADD COLUMN     "mpLastChargeAt" TIMESTAMP(3),
ADD COLUMN     "mpSubscribedPlan" TEXT;

-- AlterTable: fuera los campos del modelo legacy
ALTER TABLE "User" DROP COLUMN "mpPreapprovalId",
DROP COLUMN "mpPreapprovalPlanId";

-- CreateIndex
CREATE UNIQUE INDEX "User_mpCustomerId_key" ON "User"("mpCustomerId");
CREATE UNIQUE INDEX "User_mpPaymentProfileId_key" ON "User"("mpPaymentProfileId");

-- Index del runner de renovaciones: solo mira suscriptores de MP con el perfil
-- listo para cobrar.
CREATE INDEX "User_mpPaymentProfileStatus_subscriptionStatus_idx" ON "User"("mpPaymentProfileStatus", "subscriptionStatus");
