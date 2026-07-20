-- CreateEnum
CREATE TYPE "DigitalBookSource" AS ENUM ('URL', 'FILE');

-- AlterTable
ALTER TABLE "DigitalBook" ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "source" "DigitalBookSource" NOT NULL DEFAULT 'URL',
ALTER COLUMN "url" DROP NOT NULL;
