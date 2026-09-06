import { NotFoundException } from '@nestjs/common';
import { WorkerApiController } from './worker-api.controller';

/**
 * "Cấp độ theo lớp" — thứ tự chọn rubric của `GET /internal/criteria/:courseId`:
 *   1. criteria mà lớp ghim, CHỈ KHI nó thuộc đúng khóa của học viên
 *   2. ngược lại: bản `version` cao nhất của khóa (hành vi trước khi có tính năng này)
 * Điểm cốt lõi cần bảo vệ: mọi đường thất bại đều phải RƠI VỀ (1)→(2), không được ném lỗi,
 * vì một lớp cấu hình sai không được phép làm chết đường chấm của cả khóa.
 */
describe('WorkerApiController.criteria — chọn rubric theo lớp', () => {
  const LATEST = { id: 2, courseId: 5, version: 9 };
  const PINNED = { id: 7, courseId: 5, version: 1 };

  let prisma: {
    classConfig: { findUnique: jest.Mock };
    criteria: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let controller: WorkerApiController;

  beforeEach(() => {
    prisma = {
      classConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      criteria: {
        findUnique: jest.fn().mockResolvedValue(PINNED),
        findFirst: jest.fn().mockResolvedValue(LATEST),
      },
    };
    controller = new WorkerApiController(prisma as never, { publishStatus: jest.fn() } as never);
  });

  it('không truyền className ⇒ bản mới nhất của khóa, không tra classes_config', async () => {
    await expect(controller.criteria(5)).resolves.toBe(LATEST);
    expect(prisma.classConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.criteria.findFirst).toHaveBeenCalledWith({
      where: { courseId: 5 },
      orderBy: { version: 'desc' },
    });
  });

  it('lớp ghim criteria CÙNG khóa ⇒ dùng bản ghim, không đụng tới fallback', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: 7 });
    await expect(controller.criteria(5, '10A')).resolves.toBe(PINNED);
    expect(prisma.criteria.findFirst).not.toHaveBeenCalled();
  });

  it('lớp ghim criteria của khóa KHÁC ⇒ bỏ qua ghim, rơi về bản mới nhất của khóa', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: 7 });
    prisma.criteria.findUnique.mockResolvedValue({ ...PINNED, courseId: 999 });
    await expect(controller.criteria(5, '10A')).resolves.toBe(LATEST);
  });

  it('ghim trỏ tới bản ghi đã biến mất ⇒ rơi về fallback, KHÔNG ném lỗi', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: 7 });
    prisma.criteria.findUnique.mockResolvedValue(null);
    await expect(controller.criteria(5, '10A')).resolves.toBe(LATEST);
  });

  it('lớp chưa có cấu hình ⇒ fallback', async () => {
    prisma.classConfig.findUnique.mockResolvedValue(null);
    await expect(controller.criteria(5, '10A')).resolves.toBe(LATEST);
  });

  it('lớp có cấu hình nhưng criteriaId null ⇒ fallback, không tra criteria theo id', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: null });
    await expect(controller.criteria(5, '10A')).resolves.toBe(LATEST);
    expect(prisma.criteria.findUnique).not.toHaveBeenCalled();
  });

  it('khóa chưa có criteria nào ⇒ 404 (giữ nguyên hành vi cũ)', async () => {
    prisma.criteria.findFirst.mockResolvedValue(null);
    await expect(controller.criteria(5)).rejects.toBeInstanceOf(NotFoundException);
  });
});
