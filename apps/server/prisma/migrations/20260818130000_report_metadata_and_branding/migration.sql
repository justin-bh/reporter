-- Report metadata on engagements + per-finding remediation + site-wide report branding.

-- AlterTable
ALTER TABLE "engagements" ADD COLUMN     "assessment_type" TEXT,
ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "executive_summary" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "methodology" TEXT,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "remediation" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "report_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "organization_name" TEXT NOT NULL DEFAULT 'Block Harbor',
    "accent_color" TEXT NOT NULL DEFAULT '#e82434',
    "logo_data_uri" TEXT,
    "footer_note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_settings_pkey" PRIMARY KEY ("id")
);
