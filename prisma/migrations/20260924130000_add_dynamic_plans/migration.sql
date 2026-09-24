-- Renombrar el enum legacy: en Postgres el nombre de tabla y de tipo comparten
-- namespace, y la nueva tabla "Plan" no puede convivir con el tipo "Plan".
ALTER TYPE "Plan" RENAME TO "Plan_legacy";

-- CreateTable
CREATE TABLE "Plan" (
    "slug" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "gameLimit" INTEGER,
    "imageLimit" INTEGER NOT NULL DEFAULT 1,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "Plan_active_sortOrder_idx" ON "Plan"("active", "sortOrder");

-- AlterTable: plan pasa de enum a texto, preservando el valor actual
-- (Prisma 7 no permite el cambio directo de atributo a String sin USING).
-- Se suelta el default ANTES del cambio de tipo (el literal del enum depende
-- del tipo) y se reactiva después como texto plano.
ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "plan" TYPE TEXT USING "plan"::text;
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE';

-- DropTable
DROP TABLE "PlanConfig";

-- DropType
DROP TYPE "Plan_legacy";

-- Seed planes por defecto (equivalentes a los antiguos del enum)
INSERT INTO "Plan" ("slug", "nameEs", "nameEn", "gameLimit", "imageLimit", "paid", "active", "sortOrder", "updatedAt") VALUES
    ('FREE', 'Gratis', 'Free', 25, 1, false, true, 0, CURRENT_TIMESTAMP),
    ('PRO', 'Pro', 'Pro', 500, 3, true, true, 1, CURRENT_TIMESTAMP),
    ('COLLECTOR', 'Coleccionista', 'Collector', NULL, 5, true, true, 2, CURRENT_TIMESTAMP);