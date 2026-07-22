import { StudentsService } from './students.service';

describe('StudentsService', () => {
  let prisma: { student: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock } };
  let service: StudentsService;

  beforeEach(() => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    };
    service = new StudentsService(prisma as never);
  });

  it('lists without a search filter when none is given', async () => {
    await service.list(undefined, 1);
    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined, skip: 0 }));
  });

  it('searches across code, fullName, and phone case-insensitively', async () => {
    await service.list('nam', 1);
    const call = prisma.student.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { code: { contains: 'nam', mode: 'insensitive' } },
      { fullName: { contains: 'nam', mode: 'insensitive' } },
      { phone: { contains: 'nam', mode: 'insensitive' } },
    ]);
  });

  it('paginates using page size 20', async () => {
    await service.list(undefined, 3);
    const call = prisma.student.findMany.mock.calls[0][0];
    expect(call.skip).toBe(40);
    expect(call.take).toBe(20);
  });

  it('returns total count alongside items for pagination UI', async () => {
    prisma.student.count.mockResolvedValue(57);
    const result = await service.list(undefined, 1);
    expect(result.total).toBe(57);
    expect(result.page).toBe(1);
  });

  it('updates a student by id', async () => {
    await service.update(5, { fullName: 'Nguyen Van B' });
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { fullName: 'Nguyen Van B' } });
  });
});
