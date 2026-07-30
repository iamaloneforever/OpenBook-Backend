-- CreateTable
CREATE TABLE "ReadingStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalBooksCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalPagesRead" INTEGER NOT NULL DEFAULT 0,
    "totalReadingTime" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastReadDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingStats_userId_key" ON "ReadingStats"("userId");

-- AddForeignKey
ALTER TABLE "ReadingStats" ADD CONSTRAINT "ReadingStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
