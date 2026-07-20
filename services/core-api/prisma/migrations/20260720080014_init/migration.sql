-- CreateEnum
CREATE TYPE "BindingStatus" AS ENUM ('pending', 'active');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('received', 'processing', 'graded', 'awaiting_review', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('audio', 'video', 'text', 'image', 'file', 'follow');

-- CreateEnum
CREATE TYPE "DashboardRole" AS ENUM ('admin', 'staff');

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "band_desc" TEXT,
    "llm_config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "rubric" JSONB NOT NULL,
    "source_filename" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "course_id" INTEGER,
    "class_name" TEXT,
    "campus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "synced_from_sheet_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_bindings" (
    "id" SERIAL NOT NULL,
    "zalo_user_id" TEXT NOT NULL,
    "student_id" INTEGER,
    "display_name" TEXT,
    "status" "BindingStatus" NOT NULL DEFAULT 'pending',
    "phone_entered" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_calendar" (
    "date" DATE NOT NULL,
    "note" TEXT,

    CONSTRAINT "assignment_calendar_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" SERIAL NOT NULL,
    "message_id" TEXT NOT NULL,
    "zalo_user_id" TEXT NOT NULL,
    "student_id" INTEGER,
    "kind" "SubmissionKind" NOT NULL,
    "media_url_zalo" TEXT,
    "media_path" TEXT,
    "media_deleted_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'received',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradings" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "criteria_id" INTEGER NOT NULL,
    "criteria_version" INTEGER NOT NULL,
    "scores" JSONB NOT NULL,
    "llm_feedback" TEXT NOT NULL,
    "reviewed_feedback" TEXT,
    "reviewed_by" TEXT,
    "auto_sent" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "gradings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flags" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "assigned_advisor" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes_config" (
    "class_name" TEXT NOT NULL,
    "advisor_zalo_id" TEXT NOT NULL,
    "auto_send" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "classes_config_pkey" PRIMARY KEY ("class_name")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "key" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("key","lang")
);

-- CreateTable
CREATE TABLE "outbound_log" (
    "id" SERIAL NOT NULL,
    "zalo_user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_log" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "est_usd" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_sync_log" (
    "id" SERIAL NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rows_ok" INTEGER NOT NULL,
    "rows_error" INTEGER NOT NULL,
    "error_detail" JSONB,

    CONSTRAINT "sheet_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "DashboardRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_key_key" ON "courses"("key");

-- CreateIndex
CREATE UNIQUE INDEX "students_code_key" ON "students"("code");

-- CreateIndex
CREATE INDEX "students_phone_idx" ON "students"("phone");

-- CreateIndex
CREATE INDEX "zalo_bindings_zalo_user_id_idx" ON "zalo_bindings"("zalo_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_message_id_key" ON "submissions"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "gradings_submission_id_key" ON "gradings"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_email_key" ON "dashboard_users"("email");

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_bindings" ADD CONSTRAINT "zalo_bindings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradings" ADD CONSTRAINT "gradings_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradings" ADD CONSTRAINT "gradings_criteria_id_fkey" FOREIGN KEY ("criteria_id") REFERENCES "criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flags" ADD CONSTRAINT "flags_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_log" ADD CONSTRAINT "cost_log_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
