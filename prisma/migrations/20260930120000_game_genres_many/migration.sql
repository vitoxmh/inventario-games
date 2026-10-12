-- Un juego puede tener varios géneros a la vez (acción y plataformas, por
-- ejemplo), así que `Game.genreId` se sustituye por una tabla puente.
--
-- Antes el género era una sola referencia (`SetNull`) más un texto suelto
-- (`Game.genre`) para los juegos anteriores al listado. Aquí:
--
--   1. Se crea `GameGenre` y se copia `genreId` a ella.
--   2. Los textos sueltos que no están en el listado se materializan como filas
--      de `Genre` (con `sortOrder` al final) y se enlazan. Antes se perdían al
--      editar el juego; ahora el admin puede renombrarlos o borrarlos en
--      `/admin/genres`.
--   3. Se borran `genreId` y `genre`: a partir de aquí la relación está solo en
--      la tabla puente, que es la única fuente.
--
-- Es idempotente donde importa (los `INSERT` llevan `ON CONFLICT DO NOTHING`), y
-- los ids de los géneros creados aquí se derivan del texto con md5 para que
-- reejecutarla no duplique filas ni cambie ids ya enlazados.
CREATE TABLE "GameGenre" (
    "gameId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "GameGenre_pkey" PRIMARY KEY ("gameId", "genreId")
);

CREATE INDEX "GameGenre_genreId_idx" ON "GameGenre"("genreId");

ALTER TABLE "GameGenre"
  ADD CONSTRAINT "GameGenre_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameGenre"
  ADD CONSTRAINT "GameGenre_genreId_fkey"
  FOREIGN KEY ("genreId") REFERENCES "Genre"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Lo que ya estaba enlazado a un género del listado.
INSERT INTO "GameGenre" ("gameId", "genreId")
SELECT g."id", g."genreId"
FROM "Game" AS g
WHERE g."genreId" IS NOT NULL
ON CONFLICT ("gameId", "genreId") DO NOTHING;

-- 2a. Textos sueltos: primero se evita duplicar un género que ya se llame igual
-- (comparación sin acentos, como `normalizeGenre` en `src/lib/genres.ts`, pero
-- solo con `lower`, que basta para este caso). Los que sí coincidían con un
-- nombre del listado se enlazan más abajo, sin crear nada.
INSERT INTO "Genre" ("id", "slug", "nameEs", "nameEn", "sortOrder", "updatedAt")
SELECT
  concat('genre_', md5(concat('legacy:', lower(trim(g."genre"))))),
  concat('legacy-', md5(lower(trim(g."genre")))),
  trim(g."genre"),
  trim(g."genre"),
  999,
  CURRENT_TIMESTAMP
FROM "Game" AS g
WHERE g."genreId" IS NULL
  AND g."genre" IS NOT NULL
  AND trim(g."genre") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "Genre" AS g2
    WHERE lower(g2."nameEs") = lower(trim(g."genre"))
       OR lower(g2."nameEn") = lower(trim(g."genre"))
  )
GROUP BY trim(g."genre")
ON CONFLICT ("slug") DO NOTHING;

-- 2b. Y se enlazan los dos casos: el género del listado con el mismo nombre y el
-- que se acaba de crear. El `min` del `id` es para que un texto que coincide con
-- varios nombres a la vez no deje al juego con dos géneros idénticos.
INSERT INTO "GameGenre" ("gameId", "genreId")
SELECT g."id", g2."id"
FROM "Game" AS g
JOIN "Genre" AS g2 ON g2."id" = (
  SELECT min(g3."id")
  FROM "Genre" AS g3
  WHERE lower(g3."nameEs") = lower(trim(g."genre"))
     OR lower(g3."nameEn") = lower(trim(g."genre"))
)
WHERE g."genreId" IS NULL
  AND g."genre" IS NOT NULL
  AND trim(g."genre") <> ''
ON CONFLICT ("gameId", "genreId") DO NOTHING;

INSERT INTO "GameGenre" ("gameId", "genreId")
SELECT g."id", g2."id"
FROM "Game" AS g
JOIN "Genre" AS g2
  ON g2."slug" = concat('legacy-', md5(lower(trim(g."genre"))))
WHERE g."genreId" IS NULL
  AND g."genre" IS NOT NULL
  AND trim(g."genre") <> ''
ON CONFLICT ("gameId", "genreId") DO NOTHING;

-- 3. Las columnas viejas. El índice y la FK se tiran con ellas.
DROP INDEX IF EXISTS "Game_genreId_idx";

ALTER TABLE "Game" DROP CONSTRAINT IF EXISTS "Game_genreId_fkey";

ALTER TABLE "Game" DROP COLUMN "genreId";
ALTER TABLE "Game" DROP COLUMN "genre";