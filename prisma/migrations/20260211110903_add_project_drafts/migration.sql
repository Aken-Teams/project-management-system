-- CreateTable
CREATE TABLE "project_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_drafts_user_id_idx" ON "project_drafts"("user_id");

-- AddForeignKey
ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
