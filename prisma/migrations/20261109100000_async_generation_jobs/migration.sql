-- AlterTable GenerationJob
ALTER TABLE "GenerationJob" ADD COLUMN "lastErrorCode" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GenerationJob" ADD COLUMN "heartbeatAt" TIMESTAMP(3);
ALTER TABLE "GenerationJob" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "assetKey" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "GenerationJob" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "GenerationJob" ADD COLUMN "thoughtTokens" INTEGER;
ALTER TABLE "GenerationJob" ADD COLUMN "costUsdMicros" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_idempotencyKey_key" ON "GenerationJob"("idempotencyKey");

