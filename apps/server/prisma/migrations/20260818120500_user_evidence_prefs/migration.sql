-- CreateTable
CREATE TABLE "user_evidence_prefs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_evidence_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_evidence_prefs_user_id_evidence_id_key" ON "user_evidence_prefs"("user_id", "evidence_id");

-- AddForeignKey
ALTER TABLE "user_evidence_prefs" ADD CONSTRAINT "user_evidence_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_evidence_prefs" ADD CONSTRAINT "user_evidence_prefs_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
