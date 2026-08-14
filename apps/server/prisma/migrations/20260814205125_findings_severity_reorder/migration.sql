-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('none', 'low', 'medium', 'high', 'critical');

-- DropIndex
DROP INDEX "findings_engagement_id_idx";

-- AlterTable
ALTER TABLE "evidence_findings" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "cvss_score" DOUBLE PRECISION,
ADD COLUMN     "cvss_vector" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "severity" "Severity";

-- CreateIndex
CREATE INDEX "findings_engagement_id_position_idx" ON "findings"("engagement_id", "position");

-- Backfill: give existing findings a stable initial order by creation time within each engagement.
UPDATE "findings" f
SET "position" = sub.rn
FROM (
  SELECT id, (row_number() OVER (PARTITION BY "engagement_id" ORDER BY "created_at", id) - 1) AS rn
  FROM "findings"
) sub
WHERE f.id = sub.id;

-- Backfill: order evidence within each finding by the evidence's occurrence time.
UPDATE "evidence_findings" ef
SET "position" = sub.rn
FROM (
  SELECT ef2."evidence_id", ef2."finding_id",
         (row_number() OVER (PARTITION BY ef2."finding_id" ORDER BY e."occurred_at", e."id") - 1) AS rn
  FROM "evidence_findings" ef2
  JOIN "evidence" e ON e."id" = ef2."evidence_id"
) sub
WHERE ef."evidence_id" = sub."evidence_id" AND ef."finding_id" = sub."finding_id";
