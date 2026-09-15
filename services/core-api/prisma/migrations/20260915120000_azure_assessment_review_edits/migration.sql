-- Quyết định Chủ tịch 2026-09-15 (ILM-Clone Decisions Log D149–D152).

-- Kết quả Azure Pronunciation Assessment gốc (điểm 0–100, lỗi phát âm, transcript, band đã quy đổi).
ALTER TABLE "gradings" ADD COLUMN "assessment" JSONB;

-- Bản giáo viên đã sửa. `scores` (AI) giữ NGUYÊN, không bao giờ bị ghi đè — cần để đo độ lệch
-- giữa AI và giáo viên (Grading spec §8.4 quy tắc 1).
ALTER TABLE "gradings" ADD COLUMN "reviewed_scores" JSONB;
ALTER TABLE "gradings" ADD COLUMN "reviewed_at" TIMESTAMP(3);

-- Văn bản bài đọc hiện tại của lớp: có thì Azure chấm theo văn bản (§13A — bắt buộc với giọng trẻ em).
ALTER TABLE "classes_config" ADD COLUMN "reading_text" TEXT;
