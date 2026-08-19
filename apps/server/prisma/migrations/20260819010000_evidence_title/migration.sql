-- Evidence gains a dedicated `title` (short label) distinct from `description`
-- (longer prose). The old `description` was the single label field, so backfill
-- it into `title`, then clear `description` for existing rows: after this, the
-- former label lives in `title` and `description` starts empty (matching the new
-- create forms, where the user fills both).
ALTER TABLE "evidence" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
UPDATE "evidence" SET "title" = "description";
UPDATE "evidence" SET "description" = '';
