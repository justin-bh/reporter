-- Engagement lifecycle dates: started_at (defaults to creation time, editable),
-- projected_end_at (operator-entered target) and actual_end_at (stamped when the
-- engagement leaves `active`).
ALTER TABLE "engagements"
  ADD COLUMN "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "projected_end_at" TIMESTAMP(3),
  ADD COLUMN "actual_end_at" TIMESTAMP(3);

-- Backfill each existing engagement's start date from its creation time.
UPDATE "engagements" SET "started_at" = "created_at";
