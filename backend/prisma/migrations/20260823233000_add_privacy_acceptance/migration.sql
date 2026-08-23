ALTER TABLE "User"
  ADD COLUMN "privacyAccepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "privacyVersion" TEXT,
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);
