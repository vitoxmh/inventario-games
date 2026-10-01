-- Créditos y valoración personal del juego.
--
-- Las tres columnas son nullable a propósito: un juego ya guardado en la BD no
-- tiene por qué tener desarrollador, publisher ni valoración, y `migrate dev`
-- rellenaría la tabla con cadenas vacías que después habría que limpiar.
--
-- `rating` es la valoración personal del 1 al 5. El rango NO se fija aquí con un
-- CHECK porque Prisma no modela esa restricción y volvería a marcar drift en el
-- siguiente `migrate dev`; el rango se valida en la API (ver
-- `src/app/api/games/[id]/route.ts`).
--
-- La migración se aplicó a mano con `prisma db execute` y se registró con
-- `prisma migrate resolve --applied`, porque el historial local de migraciones
-- ya estaba desfasado de la base de datos antes de este cambio (falta
-- `20260924140000_add_currency_rates`) y `migrate dev` pedía resetear el schema.
ALTER TABLE "Game" ADD COLUMN "developer" TEXT;
ALTER TABLE "Game" ADD COLUMN "publisher" TEXT;
ALTER TABLE "Game" ADD COLUMN "rating" INTEGER;
