-- CreateTable
CREATE TABLE "pilot_text_grading" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "criteria_id" INTEGER NOT NULL,
    "criteria_version" INTEGER NOT NULL,
    "transcript" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "llm_feedback" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_text_grading_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "cost_log" ADD COLUMN     "call_type" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pilot_text_grading_submission_id_key" ON "pilot_text_grading"("submission_id");

-- AddForeignKey
ALTER TABLE "pilot_text_grading" ADD CONSTRAINT "pilot_text_grading_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
