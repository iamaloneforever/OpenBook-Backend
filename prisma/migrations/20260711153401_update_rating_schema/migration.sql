/*
  Warnings:

  - You are about to drop the column `coverUrl` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `isbn` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,bookId]` on the table `Rating` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Rating` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Book" DROP CONSTRAINT "Book_ownerId_fkey";

-- DropIndex
DROP INDEX "Book_isbn_key";

-- DropIndex
DROP INDEX "Book_ownerId_idx";

-- DropIndex
DROP INDEX "Rating_bookId_idx";

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "coverUrl",
DROP COLUMN "isbn",
DROP COLUMN "publishedAt";

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_bookId_key" ON "Rating"("userId", "bookId");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
