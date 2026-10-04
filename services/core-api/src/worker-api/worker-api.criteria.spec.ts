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
    await expect(controller.criteria(5)).resolves.toEqual({ ...LATEST, templateScripts: [] });
    expect(prisma.classConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.criteria.findFirst).toHaveBeenCalledWith({
      where: { courseId: 5 },
      orderBy: { version: 'desc' },
    });
  });

  it('lớp ghim criteria CÙNG khóa ⇒ dùng bản ghim, không đụng tới fallback', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: 7 });
    await expect(controller.criteria(5, '10A')).resolves.toEqual({ ...PINNED, templateScripts: [] });
    expect(prisma.criteria.findFirst).not.toHaveBeenCalled();
  });

  it('lớp ghim criteria của khóa KHÁC ⇒ bỏ qua ghim, rơi về bản mới nhất của khóa', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: 7 });
    prisma.criteria.findUnique.mockResolvedValue({ ...PINNED, courseId: 999 });
    await expect(controller.criteria(5, '10A')).resolves.toEqual({ ...LATEST, templateScripts: [] });
  });

  it('ghim trỏ tới bản ghi đã biến mất ⇒ rơi về fallback, KHÔNG ném lỗi', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: 7 });
    prisma.criteria.findUnique.mockResolvedValue(null);
    await expect(controller.criteria(5, '10A')).resolves.toEqual({ ...LATEST, templateScripts: [] });
  });

  it('lớp chưa có cấu hình ⇒ fallback', async () => {
    prisma.classConfig.findUnique.mockResolvedValue(null);
    await expect(controller.criteria(5, '10A')).resolves.toEqual({ ...LATEST, templateScripts: [] });
  });

  it('lớp có cấu hình nhưng criteriaId null ⇒ fallback, không tra criteria theo id', async () => {
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', criteriaId: null });
    await expect(controller.criteria(5, '10A')).resolves.toEqual({ ...LATEST, templateScripts: [] });
    expect(prisma.criteria.findUnique).not.toHaveBeenCalled();
  });

  it('khóa chưa có criteria nào ⇒ 404 (giữ nguyên hành vi cũ)', async () => {
    prisma.criteria.findFirst.mockResolvedValue(null);
    await expect(controller.criteria(5)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WorkerApiController.criteria — kịch bản nhận xét của cấu trúc dùng chung (2026-10-03)', () => {
  const ROW = { id: 2, courseId: 5, version: 9, templateKey: 'ielts_speaking' };
  const TEMPLATE_RUBRIC = {
    schema_version: 2,
    scale: { min: 0, max: 9, step: 1 },
    dimensions: [{ key: 'pronunciation', label: 'P', weight: 1, bands: { '6': ['x'] } }],
    comment_bank: [
      { dimension: 'pronunciation', band: '6', intent: null, text: 'kịch bản band 6' },
      { dimension: null, band: null, intent: 'khen', text: 'mẫu không band — KHÔNG gửi cho worker' },
    ],
  };

  function controllerWith(template: unknown) {
    const prisma = {
      classConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      criteria: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(ROW) },
      rubricTemplate: { findUnique: jest.fn().mockResolvedValue(template) },
    };
    return { prisma, controller: new WorkerApiController(prisma as never, { publishStatus: jest.fn() } as never) };
  }

  it('attaches only the band scripts of the structure the course rubric came from', async () => {
    const { prisma, controller } = controllerWith({ key: 'ielts_speaking', rubric: TEMPLATE_RUBRIC });
    const out = await controller.criteria(5);
    expect(prisma.rubricTemplate.findUnique).toHaveBeenCalledWith({ where: { key: 'ielts_speaking' } });
    expect(out.templateScripts.map((e) => e.text)).toEqual(['kịch bản band 6']);
  });

  it('a deleted structure never breaks grading — empty scripts', async () => {
    const { controller } = controllerWith(null);
    await expect(controller.criteria(5)).resolves.toEqual({ ...ROW, templateScripts: [] });
  });
});
