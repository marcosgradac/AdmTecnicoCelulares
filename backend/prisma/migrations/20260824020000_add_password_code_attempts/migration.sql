ALTER TABLE "PasswordResetToken"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PasswordResetToken_userId_purpose_createdAt_idx"
  ON "PasswordResetToken"("userId", "purpose", "createdAt");
