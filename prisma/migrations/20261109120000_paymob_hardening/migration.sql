-- AlterEnum
ALTER TYPE "LedgerTransactionType" ADD VALUE 'REFUND_REVERSAL';

-- AlterTable Subscription
ALTER TABLE "Subscription" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'EG';
ALTER TABLE "Subscription" ADD COLUMN "paymobPlanId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lastRenewalAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable PaymentTransaction
ALTER TABLE "PaymentTransaction" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TOP_UP';
ALTER TABLE "PaymentTransaction" ADD COLUMN "planTier" "PlanTier";
ALTER TABLE "PaymentTransaction" ADD COLUMN "packId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentTransaction" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'EG';
ALTER TABLE "PaymentTransaction" ADD COLUMN "intentionId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "specialReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_intentionId_key" ON "PaymentTransaction"("intentionId");
CREATE UNIQUE INDEX "PaymentTransaction_specialReference_key" ON "PaymentTransaction"("specialReference");

