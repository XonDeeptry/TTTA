-- F9 — điểm tổng + cấp độ tính server-side (`computeTotal`), thiết kế Phần 5/Phần 8.
--
-- THÊM MỚI HOÀN TOÀN, sáu cột đều NULL được: không DEFAULT, không NOT NULL, không index,
-- không unique, không foreign key, không đổi tên/kiểu cột nào đang có.
--
-- KHÔNG BACKFILL (BR-07). NULL nghĩa là "chưa tính": mọi grading có trước F9 giữ NULL vĩnh viễn
-- trừ khi được chấm lại. Báo cáo vì thế TÍNH LẠI từ `gradings.scores` + rubric đã ghim của chính
-- nó chứ không đọc `total_score` (BR-06) — nếu đọc cột, toàn bộ lịch sử sẽ biến mất khỏi
-- avgScore/trends/classPerformance ngay ngày deploy.
--
-- `student_ack_at` do F11 ghi (nút bấm của học viên); F9 chỉ tạo cột (BR-11).
--
-- ROLLBACK: repo chưa có tiền lệ viết down-migration, và ở đây không cần — sáu cột đều nullable
-- và code bản trước không đọc tới, nên deploy ngược lại bản cũ vẫn chạy bình thường.

-- AlterTable
ALTER TABLE "gradings" ADD COLUMN     "total_score" DOUBLE PRECISION,
ADD COLUMN     "level_code" TEXT,
ADD COLUMN     "level_label" TEXT,
ADD COLUMN     "student_ack_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "current_level_code" TEXT,
ADD COLUMN     "current_level_at" TIMESTAMP(3);
