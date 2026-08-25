-- Gỡ nhánh chấm-từ-transcript (pilot A/B) theo yêu cầu chủ dự án ngày 2026-08-25.
--
-- Bài luôn được chấm TRỰC TIẾP TỪ AUDIO. Nhánh transcript-only từng được dựng để đối chiếu
-- chất lượng/chi phí (F2, changelog v1.5) nhưng CHƯA BAO GIỜ chạy: cờ `limits.pilot_dual_grading`
-- mặc định tắt và không ai bật, nên bảng này rỗng (0 dòng lúc gỡ). Lý do nghiệp vụ: transcript
-- không mang được bằng chứng phát âm (`heard_as`, vị trí giây), mà `pronunciation` là tiêu chí
-- BẮT BUỘC (mục 3.10) — chấm phát âm từ văn bản chỉ là phỏng đoán.
--
-- ĐÂY LÀ MIGRATION PHÁ HỦY. Bảng bị xóa hẳn; muốn quay lại phải khôi phục từ bản sao lưu.
-- Đã xác nhận rỗng trước khi xóa. `cost_log.call_type` GIỮ NGUYÊN (cột mở, kiểu chuỗi) — các giá
-- trị 'transcription'/'text_grade' đơn giản là không còn được ghi nữa; mọi dòng hiện có đều là
-- 'audio_grade'.

DROP TABLE IF EXISTS "pilot_text_grading";
