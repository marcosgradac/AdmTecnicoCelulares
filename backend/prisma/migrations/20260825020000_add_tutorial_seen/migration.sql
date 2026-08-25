-- Existing users are marked as seen; only users created after this migration
-- are explicitly initialized as not seen by the application.
ALTER TABLE "User" ADD COLUMN "tutorialSeen" BOOLEAN NOT NULL DEFAULT true;
