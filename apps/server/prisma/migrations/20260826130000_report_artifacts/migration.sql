-- Store the rendered report artifact so the exact deliverable (PDF, ZIP bundle,
-- or JSON export) can be re-downloaded from the Reports tab. The bytes live in
-- the blob store, never the DB; these columns hold the pointer + metadata.
-- Nullable so existing history rows (generated before artifact storage) remain
-- valid and simply read as "not downloadable".

ALTER TABLE "generated_reports" ADD COLUMN "blob_key" TEXT;
ALTER TABLE "generated_reports" ADD COLUMN "filename" TEXT;
ALTER TABLE "generated_reports" ADD COLUMN "size_bytes" INTEGER;
ALTER TABLE "generated_reports" ADD COLUMN "content_type" TEXT;
ALTER TABLE "generated_reports" ADD COLUMN "sha256" TEXT;
