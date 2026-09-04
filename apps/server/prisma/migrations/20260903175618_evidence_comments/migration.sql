-- CreateTable
CREATE TABLE "evidence_comments" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_comments_uuid_key" ON "evidence_comments"("uuid");

-- CreateIndex
CREATE INDEX "evidence_comments_evidence_id_created_at_idx" ON "evidence_comments"("evidence_id", "created_at");

-- AddForeignKey
ALTER TABLE "evidence_comments" ADD CONSTRAINT "evidence_comments_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_comments" ADD CONSTRAINT "evidence_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
