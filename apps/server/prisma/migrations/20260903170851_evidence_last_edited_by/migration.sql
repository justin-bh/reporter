-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "last_edited_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
