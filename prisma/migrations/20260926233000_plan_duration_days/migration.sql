-- La duración del plan pasa a ser un dato de la BD, editable desde /admin/plans.
-- Hasta ahora estaba repartida por el código, en tres sitios que además tenían
-- que coincidir entre sí: la constante `MP_BILLING_PERIOD_DAYS` (30) de
-- `src/lib/mp.ts`, que usaba tanto el guard de renovación del checkout de MP como
-- el barrido `/api/mp/expire`, y el `recurring.interval: "month"` con el que
-- Stripe creaba la suscripción en el checkout y en el upgrade.
--
-- `duration_days` es el número de días de acceso que compra UN pago de ese plan,
-- y es el mismo dato para los dos proveedores porque es el mismo producto: en MP
-- es el periodo pagado (lo ancla `mpLastChargeAt` y lo vence el barrido diario) y
-- en Stripe el periodo de la suscripción, que se traduce al `recurring` que
-- admita ese número de días.
--
-- El backfill es 30 días para todas las filas, que es exactamente lo que cobraba
-- el código hasta ahora, así que el cambio no mueve ni un día a nadie.
ALTER TABLE "Plan"
  ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 30;
