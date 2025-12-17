-- CreateEnum
CREATE TYPE "UxEventType" AS ENUM ('FACE_REGISTER', 'FACE_VERIFY');

-- CreateEnum
CREATE TYPE "UxResult" AS ENUM ('success', 'fail');

-- CreateEnum
CREATE TYPE "UxFailReason" AS ENUM ('quality_dark', 'quality_blurred', 'no_face', 'network', 'server', 'camera', 'not_registered');

-- CreateEnum
CREATE TYPE "UxApiRoute" AS ENUM ('tunnel_url', 'lan_url');

-- CreateTable
CREATE TABLE "ux_metric_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT,
    "tenant_id" TEXT,
    "event_type" "UxEventType" NOT NULL,
    "result" "UxResult" NOT NULL,
    "fail_reason" "UxFailReason",
    "brightness_score" DOUBLE PRECISION,
    "sharpness_score" DOUBLE PRECISION,
    "device_model" TEXT,
    "os" TEXT,
    "os_version" TEXT,
    "app_version" TEXT,
    "build_id" TEXT,
    "runtime_version" TEXT,
    "api_route" "UxApiRoute" NOT NULL,
    "face_api_base_url" TEXT,
    "gs_api_base_url" TEXT,
    "duration_ms" INTEGER,
    "http_status" INTEGER,
    "error_message" TEXT,
    "session_id" TEXT,
    "request_id" TEXT,

    CONSTRAINT "ux_metric_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ux_metric_events_created_at_idx" ON "ux_metric_events"("created_at");

-- CreateIndex
CREATE INDEX "ux_metric_events_project_id_created_at_idx" ON "ux_metric_events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ux_metric_events_tenant_id_created_at_idx" ON "ux_metric_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ux_metric_events_event_type_result_created_at_idx" ON "ux_metric_events"("event_type", "result", "created_at");

-- CreateIndex
CREATE INDEX "ux_metric_events_fail_reason_created_at_idx" ON "ux_metric_events"("fail_reason", "created_at");

-- CreateIndex
CREATE INDEX "ux_metric_events_api_route_created_at_idx" ON "ux_metric_events"("api_route", "created_at");
