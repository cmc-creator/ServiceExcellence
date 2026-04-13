-- AlterTable: add optional userId FK to Learner
ALTER TABLE "Learner" ADD COLUMN "userId" TEXT;

-- CreateIndex: enforce uniqueness of the link
CREATE UNIQUE INDEX "Learner_userId_key" ON "Learner"("userId");

-- AddForeignKey
ALTER TABLE "Learner" ADD CONSTRAINT "Learner_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: link existing Learner rows to matching User rows (same org + email)
UPDATE "Learner" l
SET "userId" = u."id"
FROM "User" u
WHERE l."organizationId" = u."organizationId"
  AND l."email" = u."email"
  AND l."userId" IS NULL;
