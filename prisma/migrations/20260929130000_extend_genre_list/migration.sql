-- Amplía el listado de géneros con los dos que faltaban en los datos ya
-- guardados, y aprovecha para remapearlos.
--
-- `Beat 'em up` y `Run and gun` sí son géneros reales (el segundo es el
-- subgénero de disparos en scroll que popularizó Contra), así que quedaban
-- fuera del listado original por descuido, no por decisión. Ahora tienen fila
-- propia y se traducen.
--
-- "Multi Game" no se toca: es un título de compilación, no un género, y se queda
-- con su texto tal cual (ver `resolveGenreLabel`).
INSERT INTO "Genre" ("id", "slug", "nameEs", "nameEn", "sortOrder", "updatedAt") VALUES
  (concat('genre_', md5('run-and-gun')), 'run-and-gun', 'Run and gun', 'Run and gun', 0,  CURRENT_TIMESTAMP),
  (concat('genre_', md5('beat-em-up')),   'beat-em-up',   'Peleas callejeras', 'Beat ''em up', 0, CURRENT_TIMESTAMP);

-- Orden definitivo del selector. Se reescriben todos porque meter dos filas en
-- medio desplazaría los `sortOrder` de las que ya existían. El orden agrupa los
-- géneros de recreativa: disparos, scrolls y luchadores van juntos.
WITH ordered("slug", "sortOrder") AS (
  VALUES
    ('action', 0),
    ('adventure', 1),
    ('rpg', 2),
    ('strategy', 3),
    ('tactics', 4),
    ('shooter', 5),
    ('run-and-gun', 6),
    ('platform', 7),
    ('beat-em-up', 8),
    ('fighting', 9),
    ('stealth', 10),
    ('survival-horror', 11),
    ('survival', 12),
    ('roguelike', 13),
    ('puzzle', 14),
    ('simulation', 15),
    ('racing', 16),
    ('sports', 17),
    ('rhythm', 18),
    ('music', 19),
    ('party', 20),
    ('board', 21),
    ('card', 22),
    ('sandbox', 23),
    ('educational', 24),
    ('indie', 25)
)
UPDATE "Genre" AS genre
SET "sortOrder" = ordered."sortOrder"
FROM ordered
WHERE genre."slug" = ordered."slug";

-- Remapeo de los juegos que se quedaron fuera. El emparejamiento es por clave
-- exacta, como el de la migración anterior: los sinónimos están escritos tal
-- cual los deja `normalizeGenre`.
--
-- "Beat 'em up, run and gun" es un híbrido de los dos y se clasifica como
-- `beat-em-up`, que es el género más específico de los dos.
WITH normalized AS (
  SELECT
    "id",
    lower(trim(regexp_replace(
      translate("genre", 'áéíóúüñçâêôÁÉÍÓÚÜÑÇÂÊÔ', 'aeiouunaceoAEIOUUNACEO'),
      '[^a-zA-Z0-9]+', ' ', 'g'
    ))) AS "key"
  FROM "Game"
  WHERE "genreId" IS NULL AND "genre" IS NOT NULL AND trim("genre") <> ''
),
synonyms("key", "slug") AS (
  VALUES
    ('beat em up', 'beat-em-up'),
    ('beat em up run and gun', 'beat-em-up'),
    ('run and gun', 'run-and-gun')
)
UPDATE "Game" AS g
SET "genreId" = genre."id"
FROM normalized
JOIN synonyms ON synonyms."key" = normalized."key"
JOIN "Genre" AS genre ON genre."slug" = synonyms."slug"
WHERE normalized."id" = g."id";
