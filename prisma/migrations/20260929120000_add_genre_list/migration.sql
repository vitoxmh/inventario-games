-- Listado cerrado de géneros.
--
-- `Game.genre` era texto libre, lo que hacía imposible traducirlo y obligaba a
-- construir el filtro de la Colección con los valores que hubiera en la tabla.
-- Ahora el género es una referencia a esta tabla, con nombre en los dos idiomas.
--
-- `Game.genre` NO se borra: los juegos que ya estaban guardados conservan ahí lo
-- que escribió el usuario, y el backfill de abajo solo rellena `genreId` en los
-- que se dejan traducir. Los que no encajan con el listado siguen mostrando ese
-- texto (ver `resolveGenreLabel` en `src/lib/genres.ts`) y ya no son editables.
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");
CREATE INDEX "Genre_slug_idx" ON "Genre"("slug");

-- Listado inicial. El orden es el de `GENRE_SEED` en `src/lib/genres.ts`, que es
-- la fuente de verdad: si se añade un género ahí, se replica aquí.
--
-- El `id` se deriva del `slug` con md5 en lugar de un `cuid()` para que la
-- migración sea reejecutable sin cambiar los ids si hace falta volver a seedear.
INSERT INTO "Genre" ("id", "slug", "nameEs", "nameEn", "sortOrder", "updatedAt") VALUES
  (concat('genre_', md5('action')),          'action',          'Acción',                 'Action',          0,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('adventure')),       'adventure',       'Aventura',               'Adventure',       1,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('rpg')),             'rpg',             'RPG',                   'RPG',             2,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('strategy')),        'strategy',        'Estrategia',            'Strategy',        3,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('tactics')),         'tactics',         'Táctica',               'Tactics',         4,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('shooter')),         'shooter',         'Disparo',               'Shooter',         5,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('platform')),        'platform',        'Plataformas',           'Platform',        6,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('fighting')),        'fighting',        'Lucha',                 'Fighting',        7,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('stealth')),         'stealth',         'Sigilo',                'Stealth',         8,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('survival-horror')), 'survival-horror', 'Supervivencia y terror', 'Survival Horror', 9,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('survival')),        'survival',        'Supervivencia',         'Survival',        10, CURRENT_TIMESTAMP),
  (concat('genre_', md5('roguelike')),       'roguelike',       'Roguelike',             'Roguelike',       11, CURRENT_TIMESTAMP),
  (concat('genre_', md5('puzzle')),          'puzzle',          'Puzles',                'Puzzle',          12, CURRENT_TIMESTAMP),
  (concat('genre_', md5('simulation')),      'simulation',      'Simulación',            'Simulation',      13, CURRENT_TIMESTAMP),
  (concat('genre_', md5('racing')),          'racing',          'Carreras',              'Racing',          14, CURRENT_TIMESTAMP),
  (concat('genre_', md5('sports')),          'sports',          'Deportes',              'Sports',          15, CURRENT_TIMESTAMP),
  (concat('genre_', md5('rhythm')),          'rhythm',          'Ritmo',                 'Rhythm',          16, CURRENT_TIMESTAMP),
  (concat('genre_', md5('music')),           'music',           'Música',                'Music',           17, CURRENT_TIMESTAMP),
  (concat('genre_', md5('party')),           'party',           'Fiesta',                'Party',           18, CURRENT_TIMESTAMP),
  (concat('genre_', md5('board')),           'board',           'Tablero',               'Board',           19, CURRENT_TIMESTAMP),
  (concat('genre_', md5('card')),            'card',            'Cartas',                'Card',            20, CURRENT_TIMESTAMP),
  (concat('genre_', md5('sandbox')),         'sandbox',         'Sandbox',               'Sandbox',         21, CURRENT_TIMESTAMP),
  (concat('genre_', md5('educational')),     'educational',     'Educativo',             'Educational',     22, CURRENT_TIMESTAMP),
  (concat('genre_', md5('indie')),           'indie',           'Indie',                 'Indie',           23, CURRENT_TIMESTAMP);

ALTER TABLE "Game" ADD COLUMN "genreId" TEXT;

CREATE INDEX "Game_genreId_idx" ON "Game"("genreId");

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_genreId_fkey"
  FOREIGN KEY ("genreId") REFERENCES "Genre"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: apunta cada juego al género del listado que le corresponde.
--
-- Se comparan los nombres de la propia tabla (es y en) y una lista corta de
-- sinónimos. El emparejamiento normaliza igual que `normalizeGenre` en
-- `src/lib/genres.ts`: minúsculas, sin acentos y sin signos. `unaccent` no se
-- usa porque es una extensión que puede no existir en el proyecto de Neon.
--
-- Lo que no encaje se deja con `genreId` nulo a propósito: el texto sigue en
-- `Game.genre` y la ficha lo muestra tal cual.
--
-- Las dos cadenas de `translate` deben tener la MISMA longitud: en PostgreSQL un
-- `from` más largo que `to` borra los caracteres sobrantes, y desalinea todo lo
-- que venga después.
WITH normalized AS (
  SELECT
    "id",
    lower(trim(regexp_replace(
      translate("genre", 'áéíóúüñçâêôÁÉÍÓÚÜÑÇÂÊÔ', 'aeiouunaceoAEIOUUNACEO'),
      '[^a-zA-Z0-9]+', ' ', 'g'
    ))) AS "key"
  FROM "Game"
  WHERE "genre" IS NOT NULL AND trim("genre") <> ''
),
synonyms("key", "slug") AS (
  VALUES
    ('accion', 'action'),
    ('acciones', 'action'),
    ('accions', 'action'),
    ('aventuras', 'adventure'),
    ('rol', 'rpg'),
    ('role playing', 'rpg'),
    ('juego de rol', 'rpg'),
    ('juegos de rol', 'rpg'),
    ('estrategias', 'strategy'),
    ('estrategia en tiempo real', 'strategy'),
    ('rts', 'strategy'),
    ('tactica', 'tactics'),
    ('tacticas', 'tactics'),
    ('shooters', 'shooter'),
    ('disparos', 'shooter'),
    ('juego de disparos', 'shooter'),
    ('fps', 'shooter'),
    ('plataforma', 'platform'),
    ('plataformas', 'platform'),
    ('platformer', 'platform'),
    ('juego de plataformas', 'platform'),
    ('arcade', 'platform'),
    ('peleas', 'fighting'),
    ('infiltracion', 'stealth'),
    ('terror', 'survival-horror'),
    ('supervivencia y terror', 'survival-horror'),
    ('sobrevivencia y terror', 'survival-horror'),
    ('supervivencias', 'survival'),
    ('roguelite', 'roguelike'),
    ('roguelikes', 'roguelike'),
    ('puzle', 'puzzle'),
    ('puzles', 'puzzle'),
    ('puzzles', 'puzzle'),
    ('rompecabezas', 'puzzle'),
    ('simulador', 'simulation'),
    ('simuladores', 'simulation'),
    ('simuladores de vida', 'simulation'),
    ('carrera', 'racing'),
    ('carreras', 'racing'),
    ('carreras de coches', 'racing'),
    ('deporte', 'sports'),
    ('deportes', 'sports'),
    ('musical', 'rhythm'),
    ('musica', 'music'),
    ('fiestas', 'party'),
    ('juego de tablero', 'board'),
    ('juego de cartas', 'card'),
    ('carta', 'card'),
    ('naipes', 'card'),
    ('educativa', 'educational'),
    ('educativo', 'educational'),
    ('educacion', 'educational'),
    ('independientes', 'indie')
),
candidates AS (
  SELECT "key", "slug" FROM synonyms
  UNION ALL
  SELECT
    lower(trim(regexp_replace(
      translate("nameEs", 'áéíóúüñçâêôÁÉÍÓÚÜÑÇÂÊÔ', 'aeiouunaceoAEIOUUNACEO'),
      '[^a-zA-Z0-9]+', ' ', 'g'
    ))), "slug"
  FROM "Genre"
  UNION ALL
  SELECT
    lower(trim(regexp_replace(
      translate("nameEn", 'áéíóúüñçâêôÁÉÍÓÚÜÑÇÂÊÔ', 'aeiouunaceoAEIOUUNACEO'),
      '[^a-zA-Z0-9]+', ' ', 'g'
    ))), "slug"
  FROM "Genre"
),
resolved AS (
  SELECT DISTINCT ON ("key") "key", "slug"
  FROM candidates
  WHERE "key" <> ''
  ORDER BY "key", "slug"
)
UPDATE "Game" AS g
SET "genreId" = genre."id"
FROM normalized
JOIN resolved ON resolved."key" = normalized."key"
JOIN "Genre" AS genre ON genre."slug" = resolved."slug"
WHERE normalized."id" = g."id";
