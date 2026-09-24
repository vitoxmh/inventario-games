-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Platform_name_key" ON "Platform"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");

-- CreateIndex
CREATE INDEX "Platform_slug_idx" ON "Platform"("slug");

-- Seed with current legacy platforms + fallback bucket
INSERT INTO "Platform" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
    ('platform_nintendo', 'Nintendo', 'nintendo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('platform_playstation', 'PlayStation', 'playstation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('platform_pc', 'PC', 'pc', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('platform_otra', 'Otra', 'otra', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AddChildColumn (nullable first for backfill)
ALTER TABLE "Game" ADD COLUMN "platformId" TEXT;

-- Backfill: match legacy free-text platform to Platform by trimmed, case-insensitive name
UPDATE "Game" g
SET "platformId" = p."id"
FROM "Platform" p
WHERE lower(btrim(g."platform")) = lower(p."name");

-- Any legacy value without a match -> fallback bucket "Otra"
UPDATE "Game" g
SET "platformId" = 'platform_otra'
WHERE g."platformId" IS NULL;

-- Enforce NOT NULL + FK
ALTER TABLE "Game" ALTER COLUMN "platformId" SET NOT NULL;

ALTER TABLE "Game" ADD CONSTRAINT "Game_platformId_fkey"
FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Game_platformId_idx" ON "Game"("platformId");

-- DropColumn (removes the legacy free-text platform and its index)
ALTER TABLE "Game" DROP COLUMN "platform";