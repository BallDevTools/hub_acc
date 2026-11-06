-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "PostJobStatus" AS ENUM ('scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled');

-- AlterTable
ALTER TABLE "oauth_connections" ADD COLUMN     "page_id" UUID;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "meta_page_id" TEXT;

-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_jobs" (
    "id" UUID NOT NULL,
    "content_item_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "PostJobStatus" NOT NULL DEFAULT 'scheduled',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "external_post_id" TEXT,
    "last_error" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_daily" (
    "page_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metrics_daily_pkey" PRIMARY KEY ("page_id","date","metric")
);

-- CreateIndex
CREATE INDEX "content_items_status_updated_at_idx" ON "content_items"("status", "updated_at");

-- CreateIndex
CREATE INDEX "post_jobs_status_scheduled_at_idx" ON "post_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "post_jobs_page_id_scheduled_at_idx" ON "post_jobs"("page_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_jobs_content_item_id_page_id_key" ON "post_jobs"("content_item_id", "page_id");

-- CreateIndex
CREATE INDEX "metrics_daily_date_idx" ON "metrics_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_connections_page_id_key" ON "oauth_connections"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_meta_page_id_key" ON "pages"("meta_page_id");

-- AddForeignKey
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_jobs" ADD CONSTRAINT "post_jobs_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_jobs" ADD CONSTRAINT "post_jobs_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

