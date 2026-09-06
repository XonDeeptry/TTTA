import { BadRequestException } from '@nestjs/common';
import { ClassesConfigService } from './classes-config.service';

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
