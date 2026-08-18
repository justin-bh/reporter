-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "parent_evidence_id" INTEGER;

-- CreateIndex
CREATE INDEX "evidence_parent_evidence_id_idx" ON "evidence"("parent_evidence_id");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_parent_evidence_id_fkey" FOREIGN KEY ("parent_evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
