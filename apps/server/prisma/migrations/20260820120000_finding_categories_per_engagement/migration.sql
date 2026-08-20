-- Finding categories become per-engagement instead of a single global pool.
-- Findings already carry their own engagement, so we split each global category
-- into one row per engagement that actually uses it and repoint the findings.
--
-- Note: global categories NOT referenced by any finding cannot be attributed to
-- an engagement (the old schema stored no engagement link), so they are dropped.
-- The important data — categories in use — is preserved and correctly re-scoped.

-- 1. Add the engagement link (nullable during backfill).
ALTER TABLE "finding_categories" ADD COLUMN "engagement_id" INTEGER;

-- 2. Materialize a per-engagement category row for every (engagement, name) a
--    finding currently uses. Reads only the old global rows (engagement_id NULL).
--    Every materialized row is in use by a finding, so it is created ACTIVE
--    (deleted_at defaults to NULL) even if the old global row was soft-deleted —
--    an in-use category must appear in the engagement's category list.
INSERT INTO "finding_categories" ("engagement_id", "category")
SELECT DISTINCT f."engagement_id", oc."category"
FROM "findings" f
JOIN "finding_categories" oc ON oc."id" = f."category_id"
WHERE f."category_id" IS NOT NULL
  AND oc."engagement_id" IS NULL;

-- 3. Repoint each finding to its engagement's category row (matched by name).
UPDATE "findings" f
SET "category_id" = nc."id"
FROM "finding_categories" oc, "finding_categories" nc
WHERE f."category_id" = oc."id"
  AND oc."engagement_id" IS NULL
  AND nc."engagement_id" = f."engagement_id"
  AND nc."category" = oc."category";

-- 4. Remove the now-orphaned global rows (all still have engagement_id NULL).
DELETE FROM "finding_categories" WHERE "engagement_id" IS NULL;

-- 5. Enforce the required link.
ALTER TABLE "finding_categories" ALTER COLUMN "engagement_id" SET NOT NULL;

-- 6. Swap the global-unique(category) index for a per-engagement one.
DROP INDEX "finding_categories_category_key";
CREATE UNIQUE INDEX "finding_categories_engagement_id_category_key" ON "finding_categories"("engagement_id", "category");
CREATE INDEX "finding_categories_engagement_id_idx" ON "finding_categories"("engagement_id");

-- 7. Wire the foreign key (cascade delete with the engagement).
ALTER TABLE "finding_categories" ADD CONSTRAINT "finding_categories_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
