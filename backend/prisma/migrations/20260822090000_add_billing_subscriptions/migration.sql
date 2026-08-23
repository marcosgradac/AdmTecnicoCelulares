CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');
CREATE TYPE "PlanCode" AS ENUM ('INITIAL', 'PROFESSIONAL', 'COMPLETE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'GRACE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

CREATE TABLE "Plan" (
  "code" "PlanCode" NOT NULL,
  "name" TEXT NOT NULL,
  "priceARS" INTEGER NOT NULL,
  "repairLimitPerPeriod" INTEGER,
  "trackingLimitPerPeriod" INTEGER,
  "dashboardComplete" BOOLEAN NOT NULL DEFAULT false,
  "advancedReports" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("code")
);

INSERT INTO "Plan" ("code", "name", "priceARS", "repairLimitPerPeriod", "trackingLimitPerPeriod", "dashboardComplete", "advancedReports", "displayOrder", "updatedAt") VALUES
  ('INITIAL', 'Inicial', 20000, 40, 10, false, false, 1, CURRENT_TIMESTAMP),
  ('PROFESSIONAL', 'Profesional', 35000, 150, NULL, true, true, 2, CURRENT_TIMESTAMP),
  ('COMPLETE', 'Completo', 50000, NULL, NULL, true, true, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "priceARS" = EXCLUDED."priceARS",
  "repairLimitPerPeriod" = EXCLUDED."repairLimitPerPeriod",
  "trackingLimitPerPeriod" = EXCLUDED."trackingLimitPerPeriod",
  "dashboardComplete" = EXCLUDED."dashboardComplete",
  "advancedReports" = EXCLUDED."advancedReports",
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "planCode" "PlanCode" NOT NULL DEFAULT 'COMPLETE',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "trialStartedAt" TIMESTAMP(3) NOT NULL,
  "trialEndsAt" TIMESTAMP(3) NOT NULL,
  "trialConsumedAt" TIMESTAMP(3) NOT NULL,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentSubmission" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "planCode" "PlanCode" NOT NULL,
  "expectedAmount" INTEGER NOT NULL,
  "reportedAmount" INTEGER NOT NULL,
  "payerName" TEXT NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "holderName" TEXT,
  "bankName" TEXT,
  "alias" TEXT,
  "cbuCvu" TEXT,
  "taxId" TEXT,
  "additionalText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_businessId_key" ON "Subscription"("businessId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");
CREATE INDEX "PaymentSubmission_businessId_createdAt_idx" ON "PaymentSubmission"("businessId", "createdAt");
CREATE INDEX "PaymentSubmission_status_createdAt_idx" ON "PaymentSubmission"("status", "createdAt");
CREATE INDEX "SubscriptionAuditLog_businessId_createdAt_idx" ON "SubscriptionAuditLog"("businessId", "createdAt");
CREATE INDEX "SubscriptionAuditLog_actorUserId_createdAt_idx" ON "SubscriptionAuditLog"("actorUserId", "createdAt");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditLog" ADD CONSTRAINT "SubscriptionAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditLog" ADD CONSTRAINT "SubscriptionAuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Subscription" ("id", "businessId", "planCode", "status", "trialStartedAt", "trialEndsAt", "trialConsumedAt", "createdAt", "updatedAt")
SELECT 'sub_' || md5(random()::text || "id"), "id", 'COMPLETE', 'TRIALING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business"
ON CONFLICT ("businessId") DO NOTHING;
