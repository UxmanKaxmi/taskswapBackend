-- CreateTable
CREATE TABLE "FeatureFlags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motivation" BOOLEAN NOT NULL DEFAULT true,
    "advice" BOOLEAN NOT NULL DEFAULT false,
    "decision" BOOLEAN NOT NULL DEFAULT false,
    "reminder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlags_userId_key" ON "FeatureFlags"("userId");

-- AddForeignKey
ALTER TABLE "FeatureFlags" ADD CONSTRAINT "FeatureFlags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
