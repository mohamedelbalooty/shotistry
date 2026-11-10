-- CreateTable BetaInviteCode
CREATE TABLE "BetaInviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable BetaInviteRedemption
CREATE TABLE "BetaInviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaInviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable ImageFeedback
CREATE TABLE "ImageFeedback" (
    "id" TEXT NOT NULL,
    "generatedImageId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BetaInviteCode_code_key" ON "BetaInviteCode"("code");

-- CreateIndex
CREATE INDEX "BetaInviteRedemption_userId_idx" ON "BetaInviteRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BetaInviteRedemption_inviteCodeId_userId_key" ON "BetaInviteRedemption"("inviteCodeId", "userId");

-- CreateIndex
CREATE INDEX "ImageFeedback_generatedImageId_idx" ON "ImageFeedback"("generatedImageId");

-- CreateIndex
CREATE INDEX "ImageFeedback_workspaceId_idx" ON "ImageFeedback"("workspaceId");

-- AddForeignKey
ALTER TABLE "BetaInviteRedemption" ADD CONSTRAINT "BetaInviteRedemption_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "BetaInviteCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaInviteRedemption" ADD CONSTRAINT "BetaInviteRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageFeedback" ADD CONSTRAINT "ImageFeedback_generatedImageId_fkey" FOREIGN KEY ("generatedImageId") REFERENCES "GeneratedImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageFeedback" ADD CONSTRAINT "ImageFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageFeedback" ADD CONSTRAINT "ImageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
