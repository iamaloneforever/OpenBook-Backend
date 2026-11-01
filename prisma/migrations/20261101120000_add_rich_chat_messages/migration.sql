-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "bookPreviews" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "bookReferences" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "quote" JSONB,
ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "spoiler" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bound persisted attachment arrays as well as API input.
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_book_previews_array"
  CHECK (jsonb_typeof("bookPreviews") = 'array' AND jsonb_array_length("bookPreviews") <= 3);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_book_references_array"
  CHECK (jsonb_typeof("bookReferences") = 'array' AND jsonb_array_length("bookReferences") <= 3);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_quote_object"
  CHECK ("quote" IS NULL OR jsonb_typeof("quote") = 'object');
