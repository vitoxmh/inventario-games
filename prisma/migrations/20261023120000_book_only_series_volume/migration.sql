-- Los cómics y mangas pasan a ser libros: un solo tipo `BOOK` con los mismos
-- datos (autoría, editorial, serie y tomo). Primero se convierten las filas que
-- ya existieran para que el cambio de tipo del enum no falle.
UPDATE "Game" SET "kind" = 'BOOK' WHERE "kind" = 'COMIC';

-- PostgreSQL no permite quitar un valor de un enum: se recrea el tipo sin
-- `COMIC` y se cambia la columna. El DEFAULT se retira antes del ALTER TYPE
-- porque está expresado con el tipo viejo, y se vuelve a poner al final.
ALTER TABLE "Game" ALTER COLUMN "kind" DROP DEFAULT;

CREATE TYPE "CollectionKind_new" AS ENUM ('GAME', 'ACCESSORY', 'FIGURE', 'BOOK');

ALTER TABLE "Game"
  ALTER COLUMN "kind" TYPE "CollectionKind_new"
  USING ("kind"::text::"CollectionKind_new");

ALTER TYPE "CollectionKind" RENAME TO "CollectionKind_old";
ALTER TYPE "CollectionKind_new" RENAME TO "CollectionKind";
DROP TYPE "CollectionKind_old";

ALTER TABLE "Game" ALTER COLUMN "kind" SET DEFAULT 'GAME';

-- Serie/línea y número de tomo, opcionales para cualquier tipo de artículo.
ALTER TABLE "Game" ADD COLUMN "series" TEXT;
ALTER TABLE "Game" ADD COLUMN "volume" INTEGER;
