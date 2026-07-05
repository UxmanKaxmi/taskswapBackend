CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appleRefreshToken" TEXT,
    "appleRefreshTokenUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AuthAccount" (
    "id",
    "provider",
    "providerUserId",
    "userId",
    "appleRefreshToken",
    "appleRefreshTokenUpdatedAt",
    "updatedAt"
)
SELECT
    'auth_' || md5("provider" || ':' || "providerUserId"),
    "provider",
    "providerUserId",
    "id",
    "appleRefreshToken",
    "appleRefreshTokenUpdatedAt",
    CURRENT_TIMESTAMP
FROM "User"
WHERE "provider" IS NOT NULL
  AND "providerUserId" IS NOT NULL;

CREATE UNIQUE INDEX "AuthAccount_provider_providerUserId_key" ON "AuthAccount"("provider", "providerUserId");
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
