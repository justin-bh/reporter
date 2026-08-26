-- Report history: one row per generated report document (PDF or ZIP), the audit
-- trail behind the Reports tab and the deliverable an attestation letter attests
-- to. Reports render on demand and are never stored; `summary` snapshots the
-- findings tallies so a letter stays consistent with the report as generated.

CREATE TABLE "generated_reports" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "preset" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "generated_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_reports_uuid_key" ON "generated_reports"("uuid");

CREATE INDEX "generated_reports_engagement_id_created_at_idx" ON "generated_reports"("engagement_id", "created_at");

ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
