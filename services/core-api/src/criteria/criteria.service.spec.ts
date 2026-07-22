import { NotFoundException } from '@nestjs/common';
import { CriteriaService } from './criteria.service';
import { parseRubricFromDocxBuffer } from './docx-parser';

jest.mock('./docx-parser', () => ({ parseRubricFromDocxBuffer: jest.fn() }));

describe('CriteriaService', () => {
  let prisma: { criteria: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock } };
  let service: CriteriaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      criteria: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    };
    service = new CriteriaService(prisma as never);
  });

  it('get() throws NotFoundException for a missing id', async () => {
    prisma.criteria.findUnique.mockResolvedValue(null);
    await expect(service.get(1)).rejects.toThrow(NotFoundException);
  });

  it('ingestDocx creates version 1 when no prior criteria exist for the course', async () => {
    (parseRubricFromDocxBuffer as jest.Mock).mockResolvedValue({ course_key: 'basic', task_type: 'speaking_clip' });
    prisma.criteria.findFirst.mockResolvedValue(null);
    prisma.criteria.create.mockResolvedValue({ id: 1, version: 1 });

    await service.ingestDocx(5, Buffer.from(''), 'rubric.docx');

    expect(prisma.criteria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ courseId: 5, version: 1 }) }),
    );
  });

  it('ingestDocx increments the version when criteria already exist for the course', async () => {
    (parseRubricFromDocxBuffer as jest.Mock).mockResolvedValue({ course_key: 'basic', task_type: 'speaking_clip' });
    prisma.criteria.findFirst.mockResolvedValue({ version: 3 });
    prisma.criteria.create.mockResolvedValue({ id: 2, version: 4 });

    await service.ingestDocx(5, Buffer.from(''), 'rubric.docx');

    expect(prisma.criteria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 4 }) }),
    );
  });
});
