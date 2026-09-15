-- ILM 2026-09-15: đo hiệu quả AI ↔ giáo viên trên TỪ PHÁT ÂM SAI. Khi giáo viên bấm Gửi, mỗi từ một dòng:
--   kept    = AI đánh dấu, giáo viên giữ
--   removed = AI đánh dấu, giáo viên "Gắn sai" (chỉ bỏ khỏi tin gửi học viên; bản AI trong gradings.scores còn nguyên)
--   added   = giáo viên thêm từ AI bỏ sót
-- Không khóa ngoại: log phải còn kể cả khi dữ liệu bài chấm bị dọn.
CREATE TABLE "word_review_log" (
    "id" SERIAL NOT NULL,
    "grading_id" INTEGER NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "course_code" TEXT,
    "dimension" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "start_sec" DOUBLE PRECISION,
    "end_sec" DOUBLE PRECISION,
    "source" TEXT,
    "needs_review" BOOLEAN,
    "gemini_confirmed" BOOLEAN,
    "heard_as" TEXT,
    "azure_accuracy" DOUBLE PRECISION,
    "azure_error_type" TEXT,
    "reviewed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_review_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "word_review_log_grading_id_idx" ON "word_review_log"("grading_id");
CREATE INDEX "word_review_log_created_at_idx" ON "word_review_log"("created_at");
