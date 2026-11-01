-- CreateEnum
CREATE TYPE "ReadListVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ReadListRole" AS ENUM ('VIEWER', 'EDITOR');

-- AlterTable
ALTER TABLE "ReadList" ADD COLUMN     "coverUrl" VARCHAR(2048),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visibility" "ReadListVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "ReadListBook" DROP CONSTRAINT "ReadListBook_pkey",
ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "catalogId" VARCHAR(100),
ADD COLUMN     "catalogPreview" JSONB,
ADD COLUMN     "catalogProvider" VARCHAR(20),
ADD COLUMN     "id" TEXT,
ADD COLUMN     "note" VARCHAR(1000),
ADD COLUMN     "position" INTEGER,
ALTER COLUMN "bookId" DROP NOT NULL;

-- Preserve all existing memberships in deterministic added order. Existing lists stay private.
WITH ranked AS (
  SELECT "readListId", "bookId",
    row_number() OVER (PARTITION BY "readListId" ORDER BY "addedAt", "bookId") - 1 AS position
  FROM "ReadListBook"
)
UPDATE "ReadListBook" item
SET "id" = 'c' || substr(md5(item."readListId" || ':' || item."bookId"), 1, 24),
    "position" = ranked.position,
    "addedById" = list."userId"
FROM ranked, "ReadList" list
WHERE item."readListId" = ranked."readListId" AND item."bookId" = ranked."bookId"
  AND list."id" = item."readListId";

ALTER TABLE "ReadListBook"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "position" SET NOT NULL,
  ADD CONSTRAINT "ReadListBook_pkey" PRIMARY KEY ("id"),
  ADD CONSTRAINT "ReadListBook_position_check" CHECK ("position" >= 0),
  ADD CONSTRAINT "ReadListBook_source_check" CHECK (
    ("bookId" IS NOT NULL AND "catalogProvider" IS NULL AND "catalogId" IS NULL AND "catalogPreview" IS NULL)
    OR
    ("bookId" IS NULL AND "catalogProvider" IS NOT NULL AND "catalogProvider" IN ('openlibrary', 'google')
      AND "catalogId" IS NOT NULL AND "catalogPreview" IS NOT NULL AND jsonb_typeof("catalogPreview") = 'object')
  );
ALTER TABLE "ReadList" ADD CONSTRAINT "ReadList_revision_check" CHECK ("revision" >= 0);

-- CreateTable
CREATE TABLE "ReadListCollaborator" (
    "readListId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ReadListRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadListCollaborator_pkey" PRIMARY KEY ("readListId","userId")
);

-- CreateTable
CREATE TABLE "ReadListSave" (
    "readListId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadListSave_pkey" PRIMARY KEY ("readListId","userId")
);

-- CreateIndex
CREATE INDEX "ReadListCollaborator_userId_idx" ON "ReadListCollaborator"("userId");

-- CreateIndex
CREATE INDEX "ReadListSave_userId_createdAt_idx" ON "ReadListSave"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReadList_visibility_updatedAt_id_idx" ON "ReadList"("visibility", "updatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "ReadListBook_addedById_idx" ON "ReadListBook"("addedById");

-- CreateIndex
CREATE UNIQUE INDEX "ReadListBook_readListId_bookId_key" ON "ReadListBook"("readListId", "bookId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadListBook_readListId_catalogProvider_catalogId_key" ON "ReadListBook"("readListId", "catalogProvider", "catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadListBook_readListId_position_key" ON "ReadListBook"("readListId", "position");

-- AddForeignKey
ALTER TABLE "ReadListBook" ADD CONSTRAINT "ReadListBook_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadListCollaborator" ADD CONSTRAINT "ReadListCollaborator_readListId_fkey" FOREIGN KEY ("readListId") REFERENCES "ReadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadListCollaborator" ADD CONSTRAINT "ReadListCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadListSave" ADD CONSTRAINT "ReadListSave_readListId_fkey" FOREIGN KEY ("readListId") REFERENCES "ReadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadListSave" ADD CONSTRAINT "ReadListSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
