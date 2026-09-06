-- "Cấp độ theo lớp": một khóa học có thể có NHIỀU criteria (các cấp độ), và mỗi lớp ghim
-- đúng một bản trong số đó.
--
-- Trước migration này, `GET /internal/criteria/:courseId` luôn trả về bản `version` cao nhất
-- của khóa, nên mọi lớp cùng khóa bị chấm bằng cùng một rubric — nhiều bản ghi `criteria` chỉ
-- đóng vai trò LỊCH SỬ PHIÊN BẢN chứ không phải các cấp độ song song để chọn.
--
-- THAY ĐỔI THUẦN CỘNG THÊM, KHÔNG PHÁ HỦY: cột nullable, không giá trị mặc định, không backfill.
-- Mọi dòng `classes_config` hiện có nhận NULL => rơi vào nhánh fallback "bản mới nhất của khóa",
-- tức hành vi y hệt trước đây. Không lớp nào đổi cách chấm cho tới khi có người ghim thủ công.
--
-- ON DELETE SET NULL (không phải CASCADE hay RESTRICT): xóa một criteria không được phép xóa
-- cấu hình lớp (mất advisor_zalo_id + auto_send) cũng không được phép chặn việc xóa. Lớp chỉ
-- lặng lẽ rơi về fallback theo khóa — trạng thái an toàn, vẫn chấm được.
--
-- Không tạo index: `classes_config` có cỡ vài chục dòng, cùng lý do đã bỏ index ở M3.6.
--
-- Lùi lại: ALTER TABLE "classes_config" DROP COLUMN "criteria_id";

ALTER TABLE "classes_config" ADD COLUMN "criteria_id" INTEGER;

ALTER TABLE "classes_config"
  ADD CONSTRAINT "classes_config_criteria_id_fkey"
  FOREIGN KEY ("criteria_id") REFERENCES "criteria"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
