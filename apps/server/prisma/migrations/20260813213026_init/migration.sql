-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('active', 'complete', 'archived');

-- CreateEnum
CREATE TYPE "EngagementRole" AS ENUM ('admin', 'write', 'read');

-- CreateEnum
CREATE TYPE "AuthScheme" AS ENUM ('local', 'oidc', 'recovery');

-- CreateEnum
CREATE TYPE "SavedQueryType" AS ENUM ('evidence', 'findings');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "headless" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scheme" "AuthScheme" NOT NULL,
    "identifier" TEXT NOT NULL,
    "password_hash" TEXT,
    "must_reset_password" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret" TEXT,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "credential_id" BYTEA NOT NULL,
    "public_key" BYTEA NOT NULL,
    "sign_count" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "access_key" TEXT NOT NULL,
    "secret_key" BYTEA NOT NULL,
    "last_auth" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "data" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagements" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_engagement_roles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "role" "EngagementRole" NOT NULL,

    CONSTRAINT "user_engagement_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_engagement_prefs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_engagement_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color_name" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_tags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color_name" TEXT NOT NULL,

    CONSTRAINT "default_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "content_type" TEXT NOT NULL,
    "content_subtype" TEXT,
    "full_blob_key" TEXT,
    "thumb_blob_key" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_metadata" (
    "id" SERIAL NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'complete',

    CONSTRAINT "evidence_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_categories" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "finding_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ready_to_report" BOOLEAN NOT NULL DEFAULT false,
    "ticket_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_tags" (
    "evidence_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "evidence_tags_pkey" PRIMARY KEY ("evidence_id","tag_id")
);

-- CreateTable
CREATE TABLE "evidence_findings" (
    "evidence_id" INTEGER NOT NULL,
    "finding_id" INTEGER NOT NULL,

    CONSTRAINT "evidence_findings_pkey" PRIMARY KEY ("evidence_id","finding_id")
);

-- CreateTable
CREATE TABLE "saved_queries" (
    "id" SERIAL NOT NULL,
    "engagement_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "type" "SavedQueryType" NOT NULL,

    CONSTRAINT "saved_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_slug_key" ON "users"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_scheme_identifier_key" ON "auth_identities"("scheme", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "webauthn_credentials_user_id_idx" ON "webauthn_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_code_hash_key" ON "recovery_codes"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_access_key_key" ON "api_keys"("access_key");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "engagements_slug_key" ON "engagements"("slug");

-- CreateIndex
CREATE INDEX "user_engagement_roles_engagement_id_idx" ON "user_engagement_roles"("engagement_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_engagement_roles_user_id_engagement_id_key" ON "user_engagement_roles"("user_id", "engagement_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_engagement_prefs_user_id_engagement_id_key" ON "user_engagement_prefs"("user_id", "engagement_id");

-- CreateIndex
CREATE INDEX "tags_engagement_id_idx" ON "tags"("engagement_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_engagement_id_name_key" ON "tags"("engagement_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "default_tags_name_key" ON "default_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_uuid_key" ON "evidence"("uuid");

-- CreateIndex
CREATE INDEX "evidence_engagement_id_occurred_at_idx" ON "evidence"("engagement_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_metadata_evidence_id_source_key" ON "evidence_metadata"("evidence_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "finding_categories_category_key" ON "finding_categories"("category");

-- CreateIndex
CREATE UNIQUE INDEX "findings_uuid_key" ON "findings"("uuid");

-- CreateIndex
CREATE INDEX "findings_engagement_id_idx" ON "findings"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_tags_tag_id_idx" ON "evidence_tags"("tag_id");

-- CreateIndex
CREATE INDEX "evidence_findings_finding_id_idx" ON "evidence_findings"("finding_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_queries_engagement_id_name_type_key" ON "saved_queries"("engagement_id", "name", "type");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_engagement_roles" ADD CONSTRAINT "user_engagement_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_engagement_roles" ADD CONSTRAINT "user_engagement_roles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_engagement_prefs" ADD CONSTRAINT "user_engagement_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_engagement_prefs" ADD CONSTRAINT "user_engagement_prefs_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_metadata" ADD CONSTRAINT "evidence_metadata_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finding_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_findings" ADD CONSTRAINT "evidence_findings_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_findings" ADD CONSTRAINT "evidence_findings_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
