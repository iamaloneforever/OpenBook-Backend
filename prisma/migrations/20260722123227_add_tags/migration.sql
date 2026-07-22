/*
  Warnings:

  - The `status` column on the `BookProgress` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "BookReadingStatus" AS ENUM ('READING', 'COMPLETED', 'PAUSED', 'DROPPED');

-- AlterTable
ALTER TABLE "BookProgress" DROP COLUMN "status",
ADD COLUMN     "status" "BookReadingStatus" NOT NULL DEFAULT 'READING';

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookTag" (
    "bookId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "BookTag_pkey" PRIMARY KEY ("bookId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "BookTag_tagId_idx" ON "BookTag"("tagId");

-- AddForeignKey
ALTER TABLE "BookTag" ADD CONSTRAINT "BookTag_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookTag" ADD CONSTRAINT "BookTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
