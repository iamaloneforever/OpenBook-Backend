/*
  Warnings:

  - Made the column `ownerId` on table `Book` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Book" ALTER COLUMN "ownerId" SET NOT NULL;

-- CreateTable
CREATE TABLE "ReadList" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadListBook" (
    "readListId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadListBook_pkey" PRIMARY KEY ("readListId","bookId")
);

-- CreateIndex
CREATE INDEX "ReadList_userId_idx" ON "ReadList"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadList_userId_title_key" ON "ReadList"("userId", "title");

-- CreateIndex
CREATE INDEX "ReadListBook_bookId_idx" ON "ReadListBook"("bookId");

-- CreateIndex
CREATE INDEX "Rating_bookId_idx" ON "Rating"("bookId");

-- AddForeignKey
ALTER TABLE "ReadList" ADD CONSTRAINT "ReadList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadListBook" ADD CONSTRAINT "ReadListBook_readListId_fkey" FOREIGN KEY ("readListId") REFERENCES "ReadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadListBook" ADD CONSTRAINT "ReadListBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
