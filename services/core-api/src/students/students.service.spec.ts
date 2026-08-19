import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudentsService } from './students.service';

function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('StudentsService', () => {
  let prisma: {
    student: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };
  let service: StudentsService;

  beforeEach(() => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
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

  it('maps a courseId FK violation on update to 400, not a raw 500', async () => {
    prisma.student.update.mockRejectedValue(prismaError('P2003'));
    await expect(service.update(5, { courseId: 999 } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a student from the dashboard "create manually" form', async () => {
    const created = { id: 1, code: '01', fullName: 'Bui van A', phone: '1', courseId: null, className: '101' };
    prisma.student.create.mockResolvedValue(created);
    const result = await service.create({ code: '01', fullName: 'Bui van A', phone: '1', className: '101' });
    expect(result).toBe(created);
    expect(prisma.student.create).toHaveBeenCalledWith({
      data: { code: '01', fullName: 'Bui van A', phone: '1', courseId: undefined, className: '101', campus: undefined },
    });
  });

  it('maps a duplicate student code to 409, not a raw 500', async () => {
    prisma.student.create.mockRejectedValue(prismaError('P2002'));
    await expect(service.create({ code: '01', fullName: 'x', phone: '1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a courseId that does not reference a real course to 400, not a raw 500', async () => {
    prisma.student.create.mockRejectedValue(prismaError('P2003'));
    await expect(service.create({ code: '01', fullName: 'x', phone: '1', courseId: 999 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes a student with no submissions/bindings referencing it', async () => {
    prisma.student.delete.mockResolvedValue({});
    await service.delete(5);
    expect(prisma.student.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('blocks deleting a student still referenced by submissions/bindings (FK) with 409, not 500', async () => {
    prisma.student.delete.mockRejectedValue(prismaError('P2003'));
    await expect(service.delete(5)).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s deleting a student that no longer exists', async () => {
    prisma.student.delete.mockRejectedValue(prismaError('P2025'));
    await expect(service.delete(5)).rejects.toBeInstanceOf(NotFoundException);
  });
});
