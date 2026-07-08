/*
  Warnings:

  - A unique constraint covering the columns `[user_id,content_hash]` on the table `documents` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "content_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "documents_user_id_content_hash_key" ON "documents"("user_id", "content_hash");
