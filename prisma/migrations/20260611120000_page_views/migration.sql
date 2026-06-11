-- CreateTable
CREATE TABLE "page_views" (
    "id" BIGSERIAL NOT NULL,
    "project_id" TEXT,
    "event_type" TEXT NOT NULL,
    "event_name" TEXT,
    "path" TEXT,
    "device_id" TEXT,
    "session_id" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device_type" TEXT,
    "os_name" TEXT,
    "client_name" TEXT,
    "referrer" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_project_id_occurred_at_idx" ON "page_views"("project_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "page_views_occurred_at_idx" ON "page_views"("occurred_at" DESC);
