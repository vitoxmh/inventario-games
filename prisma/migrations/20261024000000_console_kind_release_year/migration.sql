-- Las consolas se guardan como un tipo más de la colección y solo ellas usan el
-- año de lanzamiento. PostgreSQL permite añadir un valor al enum sin recrearlo;
-- la columna es opcional, así que no necesita backfill.
ALTER TYPE "CollectionKind" ADD VALUE 'CONSOLE';

ALTER TABLE "Game" ADD COLUMN "releaseYear" INTEGER;
