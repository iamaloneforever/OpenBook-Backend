-- CreateTable
CREATE TABLE "RssSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRefreshAt" TIMESTAMP(3) NOT NULL,
    "lastError" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RssSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RssEntry" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "guidHash" VARCHAR(64) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "url" VARCHAR(2048),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "RssEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RssSubscription_userId_url_key" ON "RssSubscription"("userId", "url");

-- CreateIndex
CREATE INDEX "RssEntry_subscriptionId_publishedAt_id_idx" ON "RssEntry"("subscriptionId", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RssEntry_subscriptionId_guidHash_key" ON "RssEntry"("subscriptionId", "guidHash");

-- AddForeignKey
ALTER TABLE "RssSubscription" ADD CONSTRAINT "RssSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RssEntry" ADD CONSTRAINT "RssEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "RssSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

