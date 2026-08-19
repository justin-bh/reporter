-- Report v2: finding kind (weakness/strength) + per-finding fields, structured
-- engagement report content (JSON), and an original filename on evidence.

-- CreateEnum
CREATE TYPE "FixEffort" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('weakness', 'strength');

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "kind" "FindingKind" NOT NULL DEFAULT 'weakness',
ADD COLUMN     "affected_target" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "impact" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fix_effort" "FixEffort" NOT NULL DEFAULT 'none',
ADD COLUMN     "iso21434_refs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "unr155_refs" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "engagements" ADD COLUMN     "scope_targets" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "scope_exclusions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "strategic_recommendations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "threat_model_narrative" TEXT,
ADD COLUMN     "threat_model_diagrams" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "execution_narrative" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "provider_contacts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "client_contacts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "software_tested" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "third_party_software" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "original_filename" TEXT;
