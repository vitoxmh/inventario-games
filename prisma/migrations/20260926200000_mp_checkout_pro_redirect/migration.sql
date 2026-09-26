-- Mercado Pago pasa de Checkout API/Automatic Payments (tarjeta guardada en un
-- payment profile, cobros automáticos) a Checkout Pro con redirección: el pago
-- ocurre en el hosted checkout de MP y no se guarda ninguna tarjeta.
--
-- Se eliminan los campos del modelo de tarjeta guardada; `mpLastChargeAt`
-- se conserva y cambia de significado: pasa a ser el inicio del último periodo
-- pagado, que es el ancla del ciclo (el barrido diario degrada a FREE a quien lo
-- tenga vencido, porque ya no hay renovaciones automáticas).

DROP INDEX IF EXISTS "User_mpPaymentProfileStatus_subscriptionStatus_idx";

DROP INDEX IF EXISTS "User_mpCustomerId_key";
DROP INDEX IF EXISTS "User_mpPaymentProfileId_key";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "mpCustomerId",
  DROP COLUMN IF EXISTS "mpPaymentProfileId",
  DROP COLUMN IF EXISTS "mpPaymentProfileStatus",
  DROP COLUMN IF EXISTS "mpPaymentMethodId",
  DROP COLUMN IF EXISTS "mpLastPaymentReferenceId",
  DROP COLUMN IF EXISTS "mpSubscribedPlan";

-- La búsqueda del barrido es "usuarios de pago con periodo vencido", así que el
-- índice pasa a colocarse sobre la columna que realmente se filtra.
CREATE INDEX "User_mpLastChargeAt_idx" ON "User"("mpLastChargeAt");
