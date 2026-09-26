-- Invertir los tiers de pago: la escalera pasa a ser
-- FREE (0) < COLLECTOR (1) < PRO (2).
--
-- Antes Coleccionista era el plan superior (ilimitado, 5 fotos) y Pro el
-- intermedio; la escalera del código (`PLAN_LADDER` en src/lib/billing.ts, con
-- los precios de `PLAN_META`: Coleccionista 4,99 / Pro 9,99) es al revés. Esta
-- migración alinea la BD con el código.
--
-- Los dos planes INTERCAMBIAN sus límites y su `sortOrder` en una sola
-- sentencia: no se imponen los valores del seed, se intercambia lo que haya
-- (los límites son editables por un admin desde /admin/plans y en producción
-- ya no son los del seed). En un único UPDATE la subconsulta de FROM ve el
-- snapshot previo, así que el cruce de valores es simétrico.
--
-- No se toca FREE, ni los nombres (cada nombre pertenece a su slug), ni los
-- usuarios: cada uno conserva su plan y, con ello, su posición relativa en la
-- escalera, que es lo menos sorprendente para quien ya paga.
UPDATE "Plan" AS target
SET "gameLimit" = other."gameLimit",
    "imageLimit" = other."imageLimit",
    "sortOrder" = other."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
    SELECT "slug", "gameLimit", "imageLimit", "sortOrder"
    FROM "Plan"
    WHERE "slug" IN ('PRO', 'COLLECTOR')
) AS other
WHERE target."slug" IN ('PRO', 'COLLECTOR')
  AND target."slug" <> other."slug";
