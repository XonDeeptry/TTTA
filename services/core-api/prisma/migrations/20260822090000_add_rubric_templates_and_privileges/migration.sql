-- F10 — mẫu cấu trúc chấm điểm + hai quyền phụ (thiết kế Phần 4, spec F10-ba.md FR-01…FR-03).
--
-- Migration này THÊM ba thứ và KHÔNG đổi/xóa/đổi tên bất kỳ cột nào đang có:
--   1. Bảng mới `rubric_templates` — đúng MỘT unique index (trên `key`), KHÔNG foreign key nào,
--      không của nó và cũng không ai trỏ vào nó.
--   2. `criteria.template_key text NULL` — CHỈ TRUY VẾT. Cố ý KHÔNG có REFERENCES, không
--      ON DELETE/ON UPDATE, không index (tiền lệ `pilot_text_grading.criteria_id` "lưu id thô,
--      không có quan hệ"). Chính vì vậy xóa một mẫu KHÔNG bao giờ đụng tới `criteria` đã soạn ra
--      từ nó, và một `template_key` mồ côi là trạng thái BÌNH THƯỜNG. Không backfill: mọi hàng
--      `criteria` có trước F10 giữ NULL vĩnh viễn (F12 mới là bên ghi trường này).
--   3. `dashboard_users.privileges text[] NOT NULL DEFAULT '{}'` + MỘT câu UPDATE chống khóa nhầm.
--
-- ⚠ CÂU `UPDATE` LÀ BẮT BUỘC, KHÔNG ĐƯỢC BỎ (thiết kế mục 4.2, ghi chú migration).
-- Trước F10, `POST /criteria` (upload .docx) chỉ gác bằng `SessionAuthGuard` ⇒ MỌI `staff`
-- đang upload được. Bản deploy này bật `PrivilegeGuard` + `@RequiresPrivilege('criteria_author')`
-- trên chính route đó. Nếu để `privileges = '{}'` cho tất cả thì mọi giáo viên hiện hữu MẤT
-- QUYỀN ngay giây phút deploy — một hồi quy im lặng. Vì cột được thêm và câu UPDATE chạy trong
-- CÙNG một migration, không tồn tại khoảng thời gian nào mà một `staff` đã migrate lại gặp guard
-- với mảng rỗng.
--
-- IDEMPOTENT: mệnh đề `NOT ('criteria_author' = ANY("privileges"))` khiến lần chạy thứ hai báo
-- `UPDATE 0` và không đổi hàng nào. Chạy lại `prisma migrate deploy` là no-op.
-- MỘT LẦN DUY NHẤT: đây là backfill cho dữ liệu CŨ, không phải giá trị mặc định. Tài khoản tạo
-- SAU migration này (POST /users) khởi đầu bằng `{}` — DEFAULT của cột nói đúng điều đó.
--
-- PHẠM VI GHI của câu UPDATE: đúng một cột `privileges`. `email`, `password_hash`, `role`,
-- `must_change_password`, `created_at` không nằm trong SET nên bất biến từng byte.
--
-- ROLLBACK: repo không có tiền lệ viết down-migration. Quay lại bản trước = phục hồi từ dump.
-- Bản code cũ vẫn chạy bình thường trên schema mới (nó không đọc ba đối tượng này).

-- CreateTable
CREATE TABLE "rubric_templates" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rubric" JSONB NOT NULL,
    -- NOT NULL có chủ ý (spec §5.1 "Required = yes"). Prisma tự nó KHÔNG phát sinh NOT NULL cho
    -- cột mảng, nhưng `prisma migrate diff` cũng không so sánh tính nullable của cột mảng nên
    -- thêm vào vẫn giữ "No difference detected" (QA fix round 1 đã kiểm chứng bằng thực nghiệm).
    -- Đáng thêm: `RubricTemplateService.toView` làm `[...row.locked]`, một giá trị NULL lọt vào
    -- bằng SQL thô sẽ thành lỗi 500 chứ không phải danh sách rỗng.
    "locked" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubric_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubric_templates_key_key" ON "rubric_templates"("key");

-- AlterTable
ALTER TABLE "criteria" ADD COLUMN     "template_key" TEXT;

-- AlterTable
-- NOT NULL có chủ ý, cùng lý do với `rubric_templates.locked` ở trên (spec AC-03.1 nêu đích danh
-- `NOT NULL DEFAULT ARRAY[]::text[]`). DEFAULT có mặt nên câu ADD COLUMN này vẫn chạy được trên
-- bảng đã có dữ liệu: Postgres điền mảng rỗng cho mọi hàng cũ.
ALTER TABLE "dashboard_users" ADD COLUMN     "privileges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill chống khóa nhầm người đang dùng (F10-ba.md AC-03.2/03.3) — idempotent, một cột.
UPDATE "dashboard_users" SET "privileges" = ARRAY['criteria_author'] WHERE "role" = 'staff' AND NOT ('criteria_author' = ANY("privileges"));
