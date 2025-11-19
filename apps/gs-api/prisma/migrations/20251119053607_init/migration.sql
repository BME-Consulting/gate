-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gate_mode" TEXT NOT NULL,
    "scan_method_lock" TEXT,
    "gate_mode_lock" TEXT,
    "check_config" JSONB NOT NULL,
    "server_lock" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "person_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "ccus_id" TEXT,
    "ccus_registered" BOOLEAN NOT NULL DEFAULT false,
    "social_insurance" BOOLEAN NOT NULL DEFAULT false,
    "residency_expiry" DATE,
    "age" INTEGER,
    "is_sole_proprietor" BOOLEAN NOT NULL DEFAULT false,
    "face_embedding" JSONB,
    "face_image_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "scan_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "gate_mode" TEXT NOT NULL,
    "decided_mode" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "rule_result" JSONB NOT NULL,
    "transport_status" TEXT NOT NULL DEFAULT 'pending',
    "transport_attempts" INTEGER NOT NULL DEFAULT 0,
    "transport_last_error" TEXT,
    "transport_idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_name_idx" ON "projects"("name");

-- CreateIndex
CREATE INDEX "projects_updated_at_idx" ON "projects"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "workers_ccus_id_key" ON "workers"("ccus_id");

-- CreateIndex
CREATE INDEX "workers_name_idx" ON "workers"("name");

-- CreateIndex
CREATE INDEX "workers_company_idx" ON "workers"("company");

-- CreateIndex
CREATE INDEX "workers_ccus_id_idx" ON "workers"("ccus_id");

-- CreateIndex
CREATE INDEX "workers_updated_at_idx" ON "workers"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "scan_events_transport_idempotency_key_key" ON "scan_events"("transport_idempotency_key");

-- CreateIndex
CREATE INDEX "scan_events_project_id_occurred_at_idx" ON "scan_events"("project_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "scan_events_person_id_occurred_at_idx" ON "scan_events"("person_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "scan_events_transport_status_idx" ON "scan_events"("transport_status");

-- CreateIndex
CREATE INDEX "scan_events_transport_idempotency_key_idx" ON "scan_events"("transport_idempotency_key");

-- CreateIndex
CREATE INDEX "idx_stats" ON "scan_events"("project_id", "decided_mode", "occurred_at");

-- CreateIndex
CREATE INDEX "scan_events_occurred_at_idx" ON "scan_events" USING BRIN ("occurred_at");

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "workers"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;
