import { BadRequestException } from '@nestjs/common';
import { ClassesConfigService } from './classes-config.service';

describe('ClassesConfigService.overview', () => {
  const COURSES = [
    { id: 13, key: 'IELTS Basic-6.0' },
    { id: 21, key: 'Little Fox' },
    { id: 30, key: 'Empty course' },
  ];
  // orderBy version desc — đúng thứ tự service yêu cầu Prisma trả về
  const CRITERIA = [
    { id: 103, courseId: 13, title: 'IELTS', version: 3, templateKey: 'ielts_speaking' },
    { id: 102, courseId: 13, title: 'IELTS', version: 2, templateKey: 'ielts_speaking' },
    { id: 121, courseId: 21, title: 'YL', version: 1, templateKey: 'cambridge_yl_a0_a2' },
  ];

  function build(groups: unknown[], configs: unknown[]): ClassesConfigService {
    const prisma = {
      student: { groupBy: jest.fn().mockResolvedValue(groups) },
      classConfig: { findMany: jest.fn().mockResolvedValue(configs) },
      course: { findMany: jest.fn().mockResolvedValue(COURSES) },
      criteria: { findMany: jest.fn().mockResolvedValue(CRITERIA) },
    };
    return new ClassesConfigService(prisma as never);
  }

  it('lists a class with NO classes_config row, using the latest criteria of its course', async () => {
    const [row] = await build([{ className: 'PILOT-TEST', courseId: 13, _count: { _all: 2 } }], []).overview();
    expect(row).toEqual({
      className: 'PILOT-TEST',
      studentCount: 2,
      courses: [{ id: 13, key: 'IELTS Basic-6.0' }],
      config: null,
      effective: { id: 103, title: 'IELTS', version: 3, templateKey: 'ielts_speaking', source: 'course_latest' },
      warnings: [],
    });
  });

  it('a pin inside the same course wins (same rule as worker-api)', async () => {
    const [row] = await build(
      [{ className: '10A', courseId: 13, _count: { _all: 1 } }],
      [{ className: '10A', advisorZaloId: '', autoSend: false, criteriaId: 102 }],
    ).overview();
    expect(row.effective).toMatchObject({ id: 102, version: 2, source: 'pinned' });
  });

  it('a pin to ANOTHER course is ignored and flagged, falling back to the course latest', async () => {
    const [row] = await build(
      [{ className: '10A', courseId: 13, _count: { _all: 1 } }],
      [{ className: '10A', advisorZaloId: 'a', autoSend: false, criteriaId: 121 }],
    ).overview();
    expect(row.effective).toMatchObject({ id: 103, source: 'course_latest' });
    expect(row.warnings).toEqual(['pin_other_course']);
  });

  it('no single answer ⇒ effective null with a warning (multiple courses / no criteria / no students)', async () => {
    const rows = await build(
      [
        { className: 'MIX', courseId: 13, _count: { _all: 1 } },
        { className: 'MIX', courseId: 21, _count: { _all: 1 } },
        { className: 'NEW', courseId: 30, _count: { _all: 4 } },
        { className: null, courseId: 13, _count: { _all: 9 } },
      ],
      [{ className: 'GHOST', advisorZaloId: 'a', autoSend: true, criteriaId: null }],
    ).overview();
    expect(rows.map((r) => [r.className, r.effective, r.warnings])).toEqual([
      ['GHOST', null, ['no_students']],
      ['MIX', null, ['multiple_courses']],
      ['NEW', null, ['no_criteria']],
    ]);
    expect(rows.find((r) => r.className === 'MIX')?.studentCount).toBe(2);
  });
});

describe('ClassesConfigService', () => {
  let prisma: {
    classConfig: { findMany: jest.Mock; upsert: jest.Mock };
    criteria: { findUnique: jest.Mock };
  };
  let service: ClassesConfigService;

  beforeEach(() => {
    prisma = {
      classConfig: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      criteria: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
    };
    service = new ClassesConfigService(prisma as never);
  });

  it('lists classes ordered by name', async () => {
    await service.list();
    expect(prisma.classConfig.findMany).toHaveBeenCalledWith({ orderBy: { className: 'asc' } });
  });

  it('creates a new class config defaulting autoSend false and criteriaId null', async () => {
    await service.upsert('10A', 'advisor-zalo-1', undefined);
    expect(prisma.classConfig.upsert).toHaveBeenCalledWith({
      where: { className: '10A' },
      create: { className: '10A', advisorZaloId: 'advisor-zalo-1', autoSend: false, criteriaId: null },
      update: { advisorZaloId: 'advisor-zalo-1' },
    });
  });

  it('updates autoSend when explicitly provided', async () => {
    await service.upsert('10A', 'advisor-zalo-1', true);
    expect(prisma.classConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { advisorZaloId: 'advisor-zalo-1', autoSend: true } }),
    );
  });

  // --- "cấp độ theo lớp": ba trạng thái của criteriaId phải PHÂN BIỆT được ---

  it('criteriaId vắng mặt ⇒ KHÔNG đụng tới ghim đang lưu', async () => {
    await service.upsert('10A', 'advisor-zalo-1', undefined, undefined);
    const call = prisma.classConfig.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('criteriaId');
    expect(prisma.criteria.findUnique).not.toHaveBeenCalled();
  });

  it('criteriaId = null ⇒ GỠ ghim (ghi null), không cần kiểm tra tồn tại', async () => {
    await service.upsert('10A', 'advisor-zalo-1', undefined, null);
    const call = prisma.classConfig.upsert.mock.calls[0][0];
    expect(call.update.criteriaId).toBeNull();
    expect(prisma.criteria.findUnique).not.toHaveBeenCalled();
  });

  it('criteriaId = số ⇒ kiểm tra tồn tại rồi ghim', async () => {
    await service.upsert('10A', 'advisor-zalo-1', undefined, 7);
    expect(prisma.criteria.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { id: true } });
    const call = prisma.classConfig.upsert.mock.calls[0][0];
    expect(call.create.criteriaId).toBe(7);
    expect(call.update.criteriaId).toBe(7);
  });

  it('criteriaId trỏ tới bản ghi không tồn tại ⇒ 400 và KHÔNG ghi gì', async () => {
    prisma.criteria.findUnique.mockResolvedValue(null);
    await expect(service.upsert('10A', 'advisor-zalo-1', undefined, 999)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.classConfig.upsert).not.toHaveBeenCalled();
  });
});
