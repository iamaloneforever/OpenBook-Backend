-- CreateEnum
CREATE TYPE "PhysicalBookSource" AS ENUM ('OWNED', 'RENTED');

-- AlterTable
ALTER TABLE "PhysicalBook" ADD COLUMN     "borrowedBy" TEXT,
ADD COLUMN     "returnDate" TIMESTAMP(3);
