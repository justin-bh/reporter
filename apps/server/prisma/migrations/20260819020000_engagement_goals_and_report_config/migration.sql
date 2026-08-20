-- Engagement goals: Target → Activity → Goal hierarchy with evidence/finding
-- links, proposal import provenance, a test approach + objectives narrative, and
-- a report-composition config on the engagement.

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('not_started', 'in_progress', 'complete', 'not_applicable');

-- AlterTable
ALTER TABLE "engagements" ADD COLUMN     "test_approach" TEXT,
ADD COLUMN     "objectives_narrative" TEXT,
ADD COLUMN     "report_config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "proposal_import" JSONB;

-- CreateTable
CREATE TABLE "engagement_targets" (
    "id" SERIAL NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_activities" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "tag_id" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_goals" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'not_started',
    "is_retest" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_evidence" (
    "goal_id" INTEGER NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_evidence_pkey" PRIMARY KEY ("goal_id","evidence_id")
);

-- CreateTable
CREATE TABLE "goal_findings" (
    "goal_id" INTEGER NOT NULL,
    "finding_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_findings_pkey" PRIMARY KEY ("goal_id","finding_id")
);

-- CreateIndex
CREATE INDEX "engagement_targets_engagement_id_position_idx" ON "engagement_targets"("engagement_id", "position");

-- CreateIndex
CREATE INDEX "target_activities_target_id_position_idx" ON "target_activities"("target_id", "position");

-- CreateIndex
CREATE INDEX "target_activities_tag_id_idx" ON "target_activities"("tag_id");

-- CreateIndex
CREATE INDEX "activity_goals_activity_id_position_idx" ON "activity_goals"("activity_id", "position");

-- CreateIndex
CREATE INDEX "goal_evidence_evidence_id_idx" ON "goal_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "goal_findings_finding_id_idx" ON "goal_findings"("finding_id");

-- AddForeignKey
ALTER TABLE "engagement_targets" ADD CONSTRAINT "engagement_targets_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_activities" ADD CONSTRAINT "target_activities_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "engagement_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_activities" ADD CONSTRAINT "target_activities_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_goals" ADD CONSTRAINT "activity_goals_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "target_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_evidence" ADD CONSTRAINT "goal_evidence_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "activity_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_evidence" ADD CONSTRAINT "goal_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_findings" ADD CONSTRAINT "goal_findings_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "activity_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_findings" ADD CONSTRAINT "goal_findings_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
