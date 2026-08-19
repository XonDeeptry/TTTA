import { ConflictException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';

function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('CoursesService', () => {
  let prisma: {
    course: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    student: { count: jest.Mock };
  };
  let service: CoursesService;

  beforeEach(() => {
    prisma = {
      course: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      student: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new CoursesService(prisma as never);
  });

  it('lists courses ordered by key', async () => {
    await service.list();
    expect(prisma.course.findMany).toHaveBeenCalledWith({ orderBy: { key: 'asc' } });
  });

  it('creates a course with an empty llmConfig when no provider is given', async () => {
    const created = { id: 1, key: 'IELTS-A1', bandDesc: null, llmConfig: {}, isActive: true };
    prisma.course.create.mockResolvedValue(created);
    const result = await service.create({ key: 'IELTS-A1' });
    expect(result).toBe(created);
    expect(prisma.course.create).toHaveBeenCalledWith({
      data: { key: 'IELTS-A1', bandDesc: undefined, llmConfig: {} },
    });
  });

  it('writes the chosen provider into llmConfig', async () => {
    prisma.course.create.mockResolvedValue({});
    await service.create({ key: 'IELTS-A1', provider: 'openai' });
    expect(prisma.course.create).toHaveBeenCalledWith({
      data: { key: 'IELTS-A1', bandDesc: undefined, llmConfig: { provider: 'openai' } },
    });
  });

  it('maps a duplicate course key to 409, not a raw 500', async () => {
    prisma.course.create.mockRejectedValue(prismaError('P2002'));
    await expect(service.create({ key: 'IELTS-A1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates only the fields provided, writing llmConfig from provider', async () => {
    prisma.course.update.mockResolvedValue({});
    await service.update(1, { provider: 'openai', isActive: false });
    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false, llmConfig: { provider: 'openai' } },
    });
  });

  it('404s updating a course that no longer exists', async () => {
    prisma.course.update.mockRejectedValue(prismaError('P2025'));
    await expect(service.update(1, { isActive: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a course with no students/criteria referencing it', async () => {
    prisma.course.delete.mockResolvedValue({});
    await service.delete(1);
    expect(prisma.course.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  // students.course_id is an OPTIONAL FK -> Postgres migration generated ON DELETE SET NULL,
  // so a plain course.delete() would silently succeed and just null out courseId — this
  // pre-check is what actually makes "in use by students" block the delete, not the FK.
  it('blocks deleting a course still referenced by students with 409, without ever calling course.delete', async () => {
    prisma.student.count.mockResolvedValue(2);
    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.course.delete).not.toHaveBeenCalled();
  });

  // criteria.course_id IS required -> ON DELETE RESTRICT -> Postgres itself throws P2003.
  it('blocks deleting a course still referenced by criteria (real FK P2003) with 409, not 500', async () => {
    prisma.course.delete.mockRejectedValue(prismaError('P2003'));
    await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s deleting a course that no longer exists', async () => {
    prisma.course.delete.mockRejectedValue(prismaError('P2025'));
    await expect(service.delete(1)).rejects.toBeInstanceOf(NotFoundException);
  });
});
