-- Campo `Game.parts`: qué piezas físicas trae la copia (cartucho/disco, caja y
-- manual). Es un enum y no un texto: la lista es cerrada y corta, y la BD es la
-- que impide que entren combinaciones que la app no sabe pintar.
--
-- `COMPLETE` está primero a propósito. El orden de un enum de Postgres no
-- promise nada, pero se declara de más completo a menos, que es como se lee en el
-- desplegable (`GAME_PARTS_VALUES` en `src/lib/game-parts.ts`).
CREATE TYPE "GameParts" AS ENUM (
  'COMPLETE',
  'GAME_BOX',
  'GAME_MANUAL',
  'BOX_MANUAL',
  'GAME',
  'BOX',
  'MANUAL'
);

ALTER TABLE "Game" ADD COLUMN "parts" "GameParts";

-- ---- Se quita el estado CIB ("Completo (CIB)") ----
--
-- Ser completo no es un estado de la copia, es qué piezas trae: eso pasa a
-- `Game.parts`. Los 10 juegos que estaban en CIB pasan a SEALED, que es lo que
-- sigue siendo cierto de ellos (una copia cerrada y sin usar); su
-- completitud se conserva en `parts = 'COMPLETE'`, que para eso se rellena
-- ahora a los que no lo tenían.
--
-- Postgres no tiene `DROP VALUE` en un enum, así que el dance es el de siempre:
-- renombrar el tipo viejo, crear el nuevo con los valores que quedan, mover la
-- columna y tirar el viejo. El DEFAULT va primero porque su expresión apunta al
-- tipo renombrado y se rompería al dropearlo.
UPDATE "Game" SET "status" = 'SEALED'::"GameStatus" WHERE "status" = 'CIB'::"GameStatus";
UPDATE "Game" SET "parts" = 'COMPLETE'::"GameParts" WHERE "status" = 'SEALED'::"GameStatus" AND "parts" IS NULL;

ALTER TABLE "Game" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "GameStatus" RENAME TO "GameStatus_old";
CREATE TYPE "GameStatus" AS ENUM ('OWNED', 'SEALED', 'LOOSE', 'DIGITAL', 'WISHLIST', 'SELLING');
ALTER TABLE "Game"
  ALTER COLUMN "status" TYPE "GameStatus"
  USING "status"::text::"GameStatus";
DROP TYPE "GameStatus_old";
ALTER TABLE "Game" ALTER COLUMN "status" SET DEFAULT 'OWNED'::"GameStatus";
