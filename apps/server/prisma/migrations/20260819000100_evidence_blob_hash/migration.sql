-- Store the blob's SHA-256 and byte size on evidence at upload time, so the
-- report's supporting-files table can list hashes without re-reading blobs.

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "size_bytes" INTEGER;
