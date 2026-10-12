-- `Game.parts` pasa de un único valor a una LISTA: el campo "qué falta" tiene
-- que poder contestar varias piezas a la vez ("le faltan la caja y el manual"), y
-- para eso lo que se guarda son las piezas AUSENTES, no la combinación entera.
--
-- El enum se recreate porque Postgres no admite quitar valores de un enum
-- (`ALTER TYPE ... DROP VALUE` no existe) y la lista de piezas ahora es de tres.
-- Se crea el tipo nuevo al lado, se copian los datos con el complemento de cada
-- valor viejo, se va el tipo y la columna anteriores y se renombra: sin ventana
-- en la que la tabla se quede sin `parts`.

-- 1. Tipo nuevo: las tres piezas que pueden faltar.
CREATE TYPE "GamePartsNew" AS ENUM ('GAME', 'BOX', 'MANUAL');

-- 2. Columna nueva y traducción de los datos. Cada valor viejo describía lo que
--    la copia TENÍA, así que su complemento es lo que le falta:
--      COMPLETE    -> no le falta nada
--      GAME_BOX    -> falta el manual
--      GAME_MANUAL -> falta la caja
--      BOX_MANUAL  -> falta el juego
--      GAME        -> faltan caja y manual
--      BOX         -> faltan juego y manual
--      MANUAL      -> faltan juego y caja
--    Las filas sin `parts` (o con un valor desconocido) se quedan vacías: no
--    se afirma nada nuevo sobre ellas.
ALTER TABLE "Game" ADD COLUMN "parts_new" "GamePartsNew"[] NOT NULL DEFAULT '{}';

UPDATE "Game"
SET "parts_new" = CASE "parts"
  WHEN 'COMPLETE'    THEN '{}'::"GamePartsNew"[]
  WHEN 'GAME_BOX'    THEN ARRAY['MANUAL']::"GamePartsNew"[]
  WHEN 'GAME_MANUAL' THEN ARRAY['BOX']::"GamePartsNew"[]
  WHEN 'BOX_MANUAL'  THEN ARRAY['GAME']::"GamePartsNew"[]
  WHEN 'GAME'        THEN ARRAY['BOX', 'MANUAL']::"GamePartsNew"[]
  WHEN 'BOX'         THEN ARRAY['GAME', 'MANUAL']::"GamePartsNew"[]
  WHEN 'MANUAL'      THEN ARRAY['GAME', 'BOX']::"GamePartsNew"[]
  ELSE '{}'::"GamePartsNew"[]
END
WHERE "parts" IS NOT NULL;

-- 3. Fuera la columna y el tipo viejos, y a renombrar los nuevos.
ALTER TABLE "Game" DROP COLUMN "parts";
DROP TYPE "GameParts";

ALTER TYPE "GamePartsNew" RENAME TO "GameParts";
ALTER TABLE "Game" RENAME COLUMN "parts_new" TO "parts";
