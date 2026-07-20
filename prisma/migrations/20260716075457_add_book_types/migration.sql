/*
  Warnings:

  - You are about to drop the column `isdigital` on the `Book` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "BookType" AS ENUM ('DIGITAL', 'PHYSICAL');

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "isdigital",
ADD COLUMN     "type" "BookType" NOT NULL DEFAULT 'PHYSICAL';

-- CreateTable
CREATE TABLE "DigitalBook" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER,

    CONSTRAINT "DigitalBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalBook" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "postalCode" TEXT,

    CONSTRAINT "PhysicalBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalBook_bookId_key" ON "DigitalBook"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalBook_bookId_key" ON "PhysicalBook"("bookId");

-- AddForeignKey
ALTER TABLE "DigitalBook" ADD CONSTRAINT "DigitalBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalBook" ADD CONSTRAINT "PhysicalBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
