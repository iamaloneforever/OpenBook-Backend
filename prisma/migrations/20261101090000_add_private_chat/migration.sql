-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "firstUserId" TEXT NOT NULL,
    "secondUserId" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientMessageId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_firstUserId_id_idx" ON "ChatConversation"("firstUserId", "id");

-- CreateIndex
CREATE INDEX "ChatConversation_secondUserId_id_idx" ON "ChatConversation"("secondUserId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_firstUserId_secondUserId_key" ON "ChatConversation"("firstUserId", "secondUserId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_sequence_key" ON "ChatMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_senderId_clientMessageId_key" ON "ChatMessage"("conversationId", "senderId", "clientMessageId");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_firstUserId_fkey" FOREIGN KEY ("firstUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_secondUserId_fkey" FOREIGN KEY ("secondUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Canonical participant ordering prevents duplicate reverse conversations and self-chat.
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_canonical_participants"
  CHECK ("firstUserId" COLLATE "C" < "secondUserId" COLLATE "C");
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_valid_sequence"
  CHECK ("lastSequence" >= 0);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_valid_content"
  CHECK (char_length(btrim("content")) BETWEEN 1 AND 4000);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_valid_sequence"
  CHECK ("sequence" > 0);
