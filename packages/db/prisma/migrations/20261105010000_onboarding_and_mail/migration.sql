-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'done', 'skipped');

-- CreateEnum
CREATE TYPE "PageKitStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('google_gmail', 'meta_user', 'meta_page');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'needs_reauth');

-- CreateEnum
CREATE TYPE "EmailClassification" AS ENUM ('approved', 'rejected', 'suspended', 'unknown');

-- CreateEnum
CREATE TYPE "EmailOutcome" AS ENUM ('applied', 'needs_review', 'dismissed');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'warning', 'critical');

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "position" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "assignee_id" UUID,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_kits" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "audience" TEXT,
    "tone" TEXT,
    "status" "PageKitStatus" NOT NULL DEFAULT 'pending',
    "drafts" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_connections" (
    "id" UUID NOT NULL,
    "provider" "ConnectionProvider" NOT NULL,
    "account_label" TEXT NOT NULL,
    "mailbox_id" UUID,
    "created_by_id" UUID NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "platform" "Platform",
    "classification" "EmailClassification" NOT NULL,
    "reason" TEXT NOT NULL,
    "outcome" "EmailOutcome" NOT NULL,
    "platform_account_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_tasks_status_due_at_idx" ON "onboarding_tasks"("status", "due_at");

-- CreateIndex
CREATE INDEX "onboarding_tasks_assignee_id_idx" ON "onboarding_tasks"("assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tasks_owner_id_template_step_key_key" ON "onboarding_tasks"("owner_id", "template", "step_key");

-- CreateIndex
CREATE INDEX "page_kits_owner_id_created_at_idx" ON "page_kits"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_connections_mailbox_id_key" ON "oauth_connections"("mailbox_id");

-- CreateIndex
CREATE INDEX "oauth_connections_provider_status_idx" ON "oauth_connections"("provider", "status");

-- CreateIndex
CREATE INDEX "email_events_outcome_received_at_idx" ON "email_events"("outcome", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_connection_id_gmail_message_id_key" ON "email_events"("connection_id", "gmail_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_read_at_created_at_idx" ON "notifications"("read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_delivered_at_idx" ON "notifications"("delivered_at");

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_kits" ADD CONSTRAINT "page_kits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "oauth_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

