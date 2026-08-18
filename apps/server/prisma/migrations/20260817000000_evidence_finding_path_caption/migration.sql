-- AlterTable
ALTER TABLE "evidence_findings" ADD COLUMN     "caption" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "in_path" BOOLEAN NOT NULL DEFAULT false;
