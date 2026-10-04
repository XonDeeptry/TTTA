-- Chủ tịch 2026-10-04: mỗi học viên chỉ gắn MỘT tài khoản Zalo đang hoạt động (chống bên thứ ba).
-- `OnboardingService.activate` đã chặn ở tầng ứng dụng; index này chặn nốt hai lượt kích hoạt song song.
-- Binding giả `test:{studentId}` của Test Upload không phải Zalo thật nên được loại khỏi ràng buộc.
--
-- ⚠ Prisma 5 không biểu diễn được index một phần trong schema.prisma. `prisma migrate dev` sẽ đề
-- xuất DROP index này ở migration kế tiếp — XÓA dòng DROP đó khỏi migration sinh ra, đừng chạy nó.
CREATE UNIQUE INDEX "zalo_bindings_one_active_zalo_per_student"
  ON "zalo_bindings" ("student_id")
  WHERE "status" = 'active' AND "zalo_user_id" NOT LIKE 'test:%';
