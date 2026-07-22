import { ClassesConfigService } from './classes-config.service';

describe('ClassesConfigService', () => {
  let prisma: { classConfig: { findMany: jest.Mock; upsert: jest.Mock } };
  let service: ClassesConfigService;

  beforeEach(() => {
    prisma = { classConfig: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() } };
    service = new ClassesConfigService(prisma as never);
  });

  it('lists classes ordered by name', async () => {
    await service.list();
    expect(prisma.classConfig.findMany).toHaveBeenCalledWith({ orderBy: { className: 'asc' } });
  });

  it('creates a new class config defaulting autoSend to false', async () => {
    await service.upsert('10A', 'advisor-zalo-1', undefined);
    expect(prisma.classConfig.upsert).toHaveBeenCalledWith({
      where: { className: '10A' },
      create: { className: '10A', advisorZaloId: 'advisor-zalo-1', autoSend: false },
      update: { advisorZaloId: 'advisor-zalo-1' },
    });
  });

  it('updates autoSend when explicitly provided', async () => {
    await service.upsert('10A', 'advisor-zalo-1', true);
    expect(prisma.classConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { advisorZaloId: 'advisor-zalo-1', autoSend: true } }),
    );
  });
});
