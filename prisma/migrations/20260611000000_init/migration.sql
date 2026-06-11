-- CreateEnum
CREATE TYPE "DeploymentState" AS ENUM ('QUEUED', 'BUILDING', 'INITIALIZING', 'READY', 'ERROR', 'CANCELED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('DOWNTIME', 'PERFORMANCE', 'DEPLOYMENT_FAILURE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEPLOY_FAILED', 'DEPLOY_READY', 'SITE_DOWN', 'SITE_RECOVERED', 'PERFORMANCE_DEGRADED', 'NEW_PROJECT', 'DAILY_REPORT', 'WEEKLY_REPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "framework" TEXT,
    "production_url" TEXT,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "state" "DeploymentState" NOT NULL,
    "url" TEXT,
    "target" TEXT,
    "branch" TEXT,
    "commit_sha" TEXT,
    "commit_message" TEXT,
    "commit_author" TEXT,
    "error_message" TEXT,
    "vercel_created_at" TIMESTAMP(3) NOT NULL,
    "ready_at" TIMESTAMP(3),
    "failure_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "url" TEXT,
    "http_status" INTEGER,
    "reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "recovery_notified_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" BIGSERIAL NOT NULL,
    "project_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status_code" INTEGER,
    "response_time_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_type" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" SERIAL NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "unique_visitors" INTEGER NOT NULL DEFAULT 0,
    "page_views" INTEGER NOT NULL DEFAULT 0,
    "top_pages" JSONB,
    "countries" JSONB,
    "devices" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");

-- CreateIndex
CREATE INDEX "deployments_project_id_vercel_created_at_idx" ON "deployments"("project_id", "vercel_created_at" DESC);

-- CreateIndex
CREATE INDEX "deployments_state_idx" ON "deployments"("state");

-- CreateIndex
CREATE INDEX "incidents_project_id_status_idx" ON "incidents"("project_id", "status");

-- CreateIndex
CREATE INDEX "incidents_status_type_idx" ON "incidents"("status", "type");

-- CreateIndex
CREATE INDEX "metrics_project_id_checked_at_idx" ON "metrics"("project_id", "checked_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_project_id_date_key" ON "analytics"("project_id", "date");

-- CreateIndex
CREATE INDEX "notifications_type_sent_at_idx" ON "notifications"("type", "sent_at" DESC);

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
