ALTER TABLE "User" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);

CREATE INDEX "User_lastOpenedAt_idx" ON "User"("lastOpenedAt");
