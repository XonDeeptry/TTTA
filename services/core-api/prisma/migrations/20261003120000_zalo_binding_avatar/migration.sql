-- 2026-10-03: lưu ảnh đại diện Zalo trên binding (tên đã có cột `display_name` nhưng chưa ai ghi).
-- Để màn Học viên cho biết mỗi học viên đang gắn với TÀI KHOẢN ZALO NÀO mà không phải gọi Zalo
-- mỗi lần mở trang (hạn mức `oa/user/detail` từng hết thật trên pilot). Chỉ thêm cột, có thể null.
ALTER TABLE "zalo_bindings" ADD COLUMN "avatar_url" TEXT;
