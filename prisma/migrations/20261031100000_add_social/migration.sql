-- CreateTable
CREATE TABLE "SocialProfile" (
    "userId" TEXT NOT NULL,
    "handle" VARCHAR(30) NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "bio" VARCHAR(160) NOT NULL DEFAULT '',
    "avatarUrl" VARCHAR(2048),
    "websiteUrl" VARCHAR(2048),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "personalizeFeed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" VARCHAR(280) NOT NULL,
    "tags" TEXT[],
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialFollow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialFollow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "SocialLike" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialLike_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "SocialPostView" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPostView_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "SocialBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialProfile_handle_key" ON "SocialProfile"("handle");

-- CreateIndex
CREATE INDEX "SocialProfile_isPublic_handle_idx" ON "SocialProfile"("isPublic", "handle");

-- CreateIndex
CREATE INDEX "SocialPost_createdAt_id_idx" ON "SocialPost"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "SocialPost_authorId_createdAt_id_idx" ON "SocialPost"("authorId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "SocialPost_parentId_createdAt_id_idx" ON "SocialPost"("parentId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "SocialPost_tags_idx" ON "SocialPost" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "SocialFollow_followingId_idx" ON "SocialFollow"("followingId");

-- CreateIndex
CREATE INDEX "SocialLike_postId_idx" ON "SocialLike"("postId");

-- CreateIndex
CREATE INDEX "SocialLike_userId_createdAt_idx" ON "SocialLike"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SocialPostView_postId_idx" ON "SocialPostView"("postId");

-- CreateIndex
CREATE INDEX "SocialPostView_userId_updatedAt_idx" ON "SocialPostView"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SocialBlock_blockedId_idx" ON "SocialBlock"("blockedId");

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialFollow" ADD CONSTRAINT "SocialFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialFollow" ADD CONSTRAINT "SocialFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialLike" ADD CONSTRAINT "SocialLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialLike" ADD CONSTRAINT "SocialLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostView" ADD CONSTRAINT "SocialPostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostView" ADD CONSTRAINT "SocialPostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialBlock" ADD CONSTRAINT "SocialBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialBlock" ADD CONSTRAINT "SocialBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "SocialProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep core invariants even if a future writer bypasses the HTTP API.
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_handle_format"
  CHECK ("handle" ~ '^[a-z0-9_]{3,30}$');
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_displayName_nonempty"
  CHECK (length(btrim("displayName")) > 0);
ALTER TABLE "SocialPost" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SocialPost" ALTER COLUMN "tags" SET NOT NULL;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_content_nonempty"
  CHECK (length(btrim("content")) > 0);
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_tag_limit"
  CHECK (cardinality("tags") <= 5);
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_no_self_reply"
  CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "SocialFollow" ADD CONSTRAINT "SocialFollow_no_self_follow"
  CHECK ("followerId" <> "followingId");
ALTER TABLE "SocialBlock" ADD CONSTRAINT "SocialBlock_no_self_block"
  CHECK ("blockerId" <> "blockedId");
