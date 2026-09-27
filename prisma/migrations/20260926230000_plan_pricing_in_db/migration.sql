-- El precio de cada plan pasa a ser un dato de la BD, editable desde
-- /admin/plans. Hasta ahora ningún importe se cobraba desde la BD: MP leía
-- MP_PRICE_PRO/MP_PRICE_COLLECTOR del entorno y Stripe cobraba el Price object
-- cuyo id estaba en STRIPE_PRICE_PRO/STRIPE_PRICE_COLLECTOR, así que cambiar un
-- precio exigía redeploy (y para Stripe, crear un Price nuevo a mano).
--
-- Hay un importe POR PROVEEDOR porque cada uno cobra en su moneda:
--   - price_cents     Stripe, en céntimos de USD   (999 = $9.99)
--   - mp_price_minor  Mercado Pago, en unidades menores de la moneda de la cuenta
--                     (MP_CURRENCY_ID). En CLP no hay parte decimal, así que
--                     9990 son $9.990 y no $99,90.
-- Los dos son enteros a propósito: ni coma flotante ni redondeos, que es lo que
-- aceptan `total_amount` de MP y `unit_amount` de Stripe.
--
-- NULL = ese proveedor no vende el plan. El checkout responde 503 en vez de
-- inventar un importe, que es la única conducta aceptable en dinero.
--
-- El backfill reproduce lo que había configurado en el entorno, para que el
-- cambio no mueva ni un céntimo: Stripe 499/999 (los mismos que arrastraba
-- PLAN_META, la constante que solo se pintaba) y MP 4990/9990.
--
-- `stripe_product_id` se deja a NULL a propósito: los Products de la cuenta
-- PRODUCTIVA de Stripe no son los de la cuenta de pruebas, así que aquí no se
-- puede saber su id. Mientras esté a null, el checkout genera un Product
-- efímero con el nombre del plan (funciona, pero ensucia el panel de Stripe);
-- el admin lo rellena una vez en /admin/plans y deja de hacerlo.
ALTER TABLE "Plan"
  ADD COLUMN "priceCents" INTEGER,
  ADD COLUMN "mpPriceMinor" INTEGER,
  ADD COLUMN "stripeProductId" TEXT;

UPDATE "Plan" SET
  "priceCents" = CASE "slug"
    WHEN 'COLLECTOR' THEN 499
    WHEN 'PRO' THEN 999
    ELSE NULL
  END,
  "mpPriceMinor" = CASE "slug"
    WHEN 'COLLECTOR' THEN 4990
    WHEN 'PRO' THEN 9990
    ELSE NULL
  END;
