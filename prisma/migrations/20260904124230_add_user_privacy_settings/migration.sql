-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showBooks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showReadlists" BOOLEAN NOT NULL DEFAULT true;
