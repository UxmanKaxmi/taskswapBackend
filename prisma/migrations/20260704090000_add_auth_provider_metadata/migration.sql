ALTER TABLE "User" ADD COLUMN "provider" TEXT;
ALTER TABLE "User" ADD COLUMN "providerUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "appleRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "appleRefreshTokenUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_provider_providerUserId_key" ON "User"("provider", "providerUserId");
