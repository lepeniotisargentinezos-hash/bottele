-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "site" TEXT,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "product" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_status_occurred_at_idx" ON "sales"("status", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "sales_project_id_occurred_at_idx" ON "sales"("project_id", "occurred_at" DESC);
