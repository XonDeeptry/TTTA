import { Logger } from '@nestjs/common';
import { BootstrapRubricTemplatesService } from './bootstrap-rubric-templates.service';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED } from './templates';

/**
 * F10 FR-07. Ca quan trọng nhất ở đây là AC-07.3 (thiết kế mục 10 ý 2): seed → sửa → khởi động
 * lại → BẢN SỬA CÒN NGUYÊN. Nếu ca đó đỏ nghĩa là mỗi lần `docker compose restart` sẽ xóa sạch
 * công sức soạn mẫu của trung tâm.
 */

type PrismaMock = {
  rubricTemplate: {
    count: jest.Mock;
    createMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function makePrisma(): PrismaMock {
  return {
    rubricTemplate: {
      count: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

function assertNoWrites(prisma: PrismaMock): void {
  // Khẳng định KHÔNG ĐƯỢC GỌI, không phải "mock thiếu thuộc tính" — đúng bản sửa của F8 OBS-01.
  expect(prisma.rubricTemplate.createMany).not.toHaveBeenCalled();
  expect(prisma.rubricTemplate.create).not.toHaveBeenCalled();
  expect(prisma.rubricTemplate.update).not.toHaveBeenCalled();
  expect(prisma.rubricTemplate.updateMany).not.toHaveBeenCalled();
  expect(prisma.rubricTemplate.upsert).not.toHaveBeenCalled();
  expect(prisma.rubricTemplate.delete).not.toHaveBeenCalled();
  expect(prisma.rubricTemplate.deleteMany).not.toHaveBeenCalled();
}

describe('BootstrapRubricTemplatesService', () => {
  let prisma: PrismaMock;
  let service: BootstrapRubricTemplatesService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = makePrisma();
    service = new BootstrapRubricTemplatesService(prisma as never);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('AC-07.1 bảng rỗng ⇒ chèn đúng 2 mẫu, isSystem/isActive = true, đúng nội dung seed', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(0);

    await service.onApplicationBootstrap();

    expect(prisma.rubricTemplate.createMany).toHaveBeenCalledTimes(1);
    const arg = prisma.rubricTemplate.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
      skipDuplicates: boolean;
    };
    expect(arg.data).toHaveLength(2);
    expect(arg.data.map((row) => row.key)).toEqual(['cambridge_yl_a0_a2', 'ielts_speaking']);
    for (const row of arg.data) {
      expect(row.isSystem).toBe(true);
      expect(row.isActive).toBe(true);
    }
    expect(arg.data[0].name).toBe(CAMBRIDGE_YL_SEED.name);
    expect(arg.data[0].rubric).toEqual(CAMBRIDGE_YL_SEED.rubric);
    expect(arg.data[0].locked).toEqual(CAMBRIDGE_YL_SEED.locked);
    expect(arg.data[1].name).toBe(IELTS_SPEAKING_SEED.name);
    expect(arg.data[1].rubric).toEqual(IELTS_SPEAKING_SEED.rubric);
    expect(arg.data[1].locked).toEqual(IELTS_SPEAKING_SEED.locked);
  });

  it('AC-07.1 rubric ghi xuống là BẢN SAO SÂU, không phải tham chiếu tới seed đã đóng băng', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(0);
    await service.onApplicationBootstrap();

    const arg = prisma.rubricTemplate.createMany.mock.calls[0][0] as { data: Array<Record<string, unknown>> };
    expect(arg.data[0].rubric).not.toBe(CAMBRIDGE_YL_SEED.rubric);
    expect(arg.data[0].locked).not.toBe(CAMBRIDGE_YL_SEED.locked);
    // Bản sao ghi được (không bị đóng băng lây).
    expect(Object.isFrozen(arg.data[0].rubric)).toBe(false);
  });

  it('AC-07.2 bảng đã có dòng ⇒ KHÔNG ghi gì cả (mọi phương thức ghi đều không được gọi)', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(1);
    await service.onApplicationBootstrap();
    assertNoWrites(prisma);
  });

  it('AC-07.3 CHỐNG GHI ĐÈ: seed → sửa → khởi động lại ⇒ hàng đã sửa còn nguyên', async () => {
    // Lần khởi động 1: bảng rỗng ⇒ seed.
    prisma.rubricTemplate.count.mockResolvedValue(0);
    await service.onApplicationBootstrap();
    expect(prisma.rubricTemplate.createMany).toHaveBeenCalledTimes(1);

    // Admin sửa hàng (đổi name, thay rubric, ẩn đi) — mô phỏng bằng một "DB" trong bộ nhớ.
    const stored = {
      key: 'cambridge_yl_a0_a2',
      name: 'Bản của trung tâm',
      rubric: { schema_version: 2, dimensions: [] },
      locked: [],
      isSystem: true,
      isActive: false,
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    };
    const snapshot = JSON.stringify(stored);

    // Lần khởi động 2: bảng KHÔNG rỗng.
    const prisma2 = makePrisma();
    prisma2.rubricTemplate.count.mockResolvedValue(2);
    const service2 = new BootstrapRubricTemplatesService(prisma2 as never);
    await service2.onApplicationBootstrap();

    assertNoWrites(prisma2);
    expect(JSON.stringify(stored)).toBe(snapshot);
    expect(stored.updatedAt).toEqual(new Date('2026-08-22T10:00:00.000Z'));
  });

  it('AC-07.4 chèn với skipDuplicates ⇒ hai tiến trình khởi động cùng lúc không sập', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(0);
    await service.onApplicationBootstrap();
    const arg = prisma.rubricTemplate.createMany.mock.calls[0][0] as { skipDuplicates: boolean };
    expect(arg.skipDuplicates).toBe(true);
  });

  it('AC-07.5 lỗi khi seed KHÔNG làm sập boot — nuốt lỗi, log ở mức error kèm key', async () => {
    prisma.rubricTemplate.count.mockRejectedValue(new Error('database unreachable'));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('cambridge_yl_a0_a2');
    expect(String(errorSpy.mock.calls[0][0])).toContain('ielts_speaking');
  });

  it('AC-07.5 P2002 từ createMany cũng bị nuốt, boot vẫn xong', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(0);
    prisma.rubricTemplate.createMany.mockRejectedValue({ code: 'P2002' });
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('AC-07.6 đúng MỘT dòng log khi seed thành công, KHÔNG log khi bảng đã có dữ liệu', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(0);
    await service.onApplicationBootstrap();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0][0])).toContain('2');

    logSpy.mockClear();
    const prisma2 = makePrisma();
    prisma2.rubricTemplate.count.mockResolvedValue(2);
    await new BootstrapRubricTemplatesService(prisma2 as never).onApplicationBootstrap();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('AC-07.7 không cần biến môi trường nào (khác BootstrapAdminService)', async () => {
    const saved = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CORE_API_')) delete process.env[key];
    }
    prisma.rubricTemplate.count.mockResolvedValue(0);
    await service.onApplicationBootstrap();
    expect(prisma.rubricTemplate.createMany).toHaveBeenCalledTimes(1);
    process.env = saved;
  });

  it('NFR-P1 bảng không rỗng ⇒ đúng MỘT truy vấn (count) và không gì khác', async () => {
    prisma.rubricTemplate.count.mockResolvedValue(5);
    await service.onApplicationBootstrap();
    expect(prisma.rubricTemplate.count).toHaveBeenCalledTimes(1);
    assertNoWrites(prisma);
  });
});
