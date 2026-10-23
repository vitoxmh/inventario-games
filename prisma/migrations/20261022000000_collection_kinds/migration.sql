-- La colección deja de ser solo de videojuegos: cada fila declara qué tipo de
-- artículo es. Las filas existentes son juegos, así que el DEFAULT hace el
-- backfill sin tocar datos.
CREATE TYPE "CollectionKind" AS ENUM (
  'GAME',
  'ACCESSORY',
  'FIGURE',
  'BOOK',
  'COMIC'
);

ALTER TABLE "Game" ADD COLUMN "kind" "CollectionKind" NOT NULL DEFAULT 'GAME';

-- Libros y cómics no tienen una plataforma de consola, así que la relación
-- pasa a ser opcional. Los juegos existentes conservan la suya y la API sigue
-- exigiendo plataforma cuando `kind = 'GAME'`.
ALTER TABLE "Game" ALTER COLUMN "platformId" DROP NOT NULL;

CREATE INDEX "Game_kind_idx" ON "Game"("kind");
