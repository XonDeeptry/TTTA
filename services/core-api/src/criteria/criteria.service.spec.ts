import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CriteriaService } from './criteria.service';
import { parseRubricFromDocxBuffer } from './docx-parser';

jest.mock('./docx-parser', () => ({ parseRubricFromDocxBuffer: jest.fn() }));

describe('CriteriaService', () => {
  /**
   * Mock CÓ đủ mọi phương thức ghi của Prisma (`update`, `upsert`, `delete`, ...) — cố ý. Nếu
   * thiếu chúng thì `expect(prisma.criteria).not.toHaveProperty('update')` chỉ khẳng định một
   * thuộc tính của chính cái mock này chứ không khẳng định gì về CriteriaService, và không bao
   * giờ đỏ được (QA F8 OBS-01). Có mặt đầy đủ thì `not.toHaveBeenCalled()` mới là bài test thật.
   */
  const WRITE_METHODS = ['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'] as const;

  let prisma: {
    criteria: Record<string, jest.Mock>;
    course: Record<string, jest.Mock>;
    rubricTemplate: Record<string, jest.Mock>;
  };
  let service: CriteriaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      criteria: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        ...Object.fromEntries(WRITE_METHODS.map((m) => [m, jest.fn()])),
      },
      // F12: `createFromJson` kiểm khóa học tồn tại trước khi ghi (AC-01.9). Mặc định là CÓ.
      course: { findUnique: jest.fn(async () => ({ id: 5 })) },
      // Có mặt để `not.toHaveBeenCalled()` là một khẳng định THẬT: `templateKey` chỉ được kiểm
      // ĐỊNH DẠNG, không bao giờ được tra cứu sự tồn tại (AC-01.8/BR-07).
      rubricTemplate: { findUnique: jest.fn(), findMany: jest.fn() },
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

  // ---- F8: nâng rubric lên v2 lúc đọc, KHÔNG ghi lại DB ----

  const V1_ROW = {
    id: 7,
    courseId: 5,
    version: 1,
    rubric: {
      course_key: 'basic',
      band_scale: [0, 3],
      dimensions: [{ name: 'pronunciation', weight: 1, bands: { '0': 'kém' } }],
      few_shot_examples: ['Bài tốt.'],
    },
  };

  it('get() returns a legacy v1 rubric normalized to v2', async () => {
    prisma.criteria.findUnique.mockResolvedValue({ ...V1_ROW });

    const row = await service.get(7);

    expect(row.rubric).toEqual(
      expect.objectContaining({
        schema_version: 2,
        scale: { min: 0, max: 3, step: 1 },
        aggregation: { method: 'average', round: 'none' },
        comment_bank: [{ dimension: null, intent: null, text: 'Bài tốt.' }],
      }),
    );
    expect((row.rubric as { dimensions: unknown[] }).dimensions[0]).toEqual(
      expect.objectContaining({ key: 'pronunciation', label: 'pronunciation', bands: { '0': ['kém'] } }),
    );
  });

  it('list() normalizes every row it returns', async () => {
    prisma.criteria.findMany.mockResolvedValue([{ ...V1_ROW }]);

    const rows = await service.list(5);

    expect(rows).toHaveLength(1);
    expect((rows[0].rubric as { schema_version: number }).schema_version).toBe(2);
  });

  it('never writes a normalized rubric back to the database (BR-01/FR-16)', async () => {
    prisma.criteria.findUnique.mockResolvedValue({ ...V1_ROW });
    prisma.criteria.findMany.mockResolvedValue([{ ...V1_ROW }]);

    await service.get(7);
    await service.list(5);

    // Khẳng định về HÀNH VI của service, không phải về hình dạng của mock: mọi phương thức ghi
    // đều tồn tại trên mock và phải KHÔNG được gọi lần nào trên đường đọc (BR-01/FR-16).
    for (const method of WRITE_METHODS) {
      expect(prisma.criteria[method]).not.toHaveBeenCalled();
    }
  });

  // ─── F12 FR-01: createFromJson ────────────────────────────────────────────────────

  describe('createFromJson (F12 FR-01)', () => {
    /** Rubric hợp lệ tối thiểu, CỐ Ý THÔ: `bands` là chuỗi (dạng v1) để chứng minh thứ được LƯU là
     * bản đã chuẩn hóa do `assertAuthorableRubric` trả về, không phải body của client. Không chép
     * literal nào của hai seed (AC-03.5). */
    const AUTHORED = {
      schema_version: 2,
      course_key: 'kid_a1',
      task_type: 'speaking_clip',
      scale: { min: 0, max: 4, step: 1 },
      aggregation: { method: 'sum', round: 'none' },
      levels: [],
      output_fields: ['comment'],
      dimensions: [{ key: 'pronunciation', label: 'Phát âm', weight: 1, bands: { '0': 'Chưa rõ.' } }],
    };

    beforeEach(() => {
      prisma.criteria.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 42,
        createdAt: new Date('2026-08-23T00:00:00.000Z'),
        ...data,
      }));
    });

    const createdData = (): Record<string, unknown> =>
      prisma.criteria.create.mock.calls[0][0].data as Record<string, unknown>;

    it('AC-01.4 version = 1 khi khóa học chưa có criteria nào', async () => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      const row = await service.createFromJson({ courseId: 5, rubric: AUTHORED });
      expect(createdData()).toEqual(expect.objectContaining({ courseId: 5, version: 1 }));
      expect(row.id).toBe(42);
    });

    it('AC-01.4 version = max + 1 khi đã có phiên bản trước', async () => {
      prisma.criteria.findFirst.mockResolvedValue({ version: 7 });
      await service.createFromJson({ courseId: 5, rubric: AUTHORED });
      expect(createdData()).toEqual(expect.objectContaining({ version: 8 }));
      expect(prisma.criteria.findFirst).toHaveBeenCalledWith({
        where: { courseId: 5 },
        orderBy: { version: 'desc' },
      });
    });

    it('AC-01.5 hai lần lưu liên tiếp ⇒ n rồi n+1; `version` trong body KHÔNG được tôn trọng', async () => {
      prisma.criteria.findFirst.mockResolvedValueOnce({ version: 2 }).mockResolvedValueOnce({ version: 3 });
      await service.createFromJson({ courseId: 5, rubric: AUTHORED, version: 99 } as never);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED, version: 99 } as never);
      expect(prisma.criteria.create.mock.calls[0][0].data.version).toBe(3);
      expect(prisma.criteria.create.mock.calls[1][0].data.version).toBe(4);
    });

    it('AC-01.4 lưu rubric ĐÃ CHUẨN HÓA (bands chuỗi ⇒ mảng), không phải body thô', async () => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED });
      const stored = createdData().rubric as { dimensions: Array<{ bands: Record<string, string[]> }> };
      expect(stored.dimensions[0].bands).toEqual({ '0': ['Chưa rõ.'] });
    });

    it('AC-01.6 title mặc định trùng KHỚP với đường .docx', async () => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      (parseRubricFromDocxBuffer as jest.Mock).mockResolvedValue({ course_key: 'kid_a1', task_type: 'speaking_clip' });

      await service.createFromJson({ courseId: 5, rubric: AUTHORED });
      const jsonTitle = createdData().title;

      prisma.criteria.create.mockClear();
      await service.ingestDocx(5, Buffer.from(''), 'rubric.docx');
      expect(jsonTitle).toBe(createdData().title);
      expect(jsonTitle).toBe('kid_a1 — speaking_clip');
    });

    it.each([[undefined], [''], ['   ']])('AC-01.6 title %p ⇒ dùng mặc định', async (title) => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED, title });
      expect(createdData().title).toBe('kid_a1 — speaking_clip');
    });

    it('AC-01.6 title có nội dung được cắt khoảng trắng và giữ nguyên', async () => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED, title: '  Bản tháng 8  ' });
      expect(createdData().title).toBe('Bản tháng 8');
    });

    it('AC-01.7 sourceFilename luôn là null', async () => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED });
      expect(createdData().sourceFilename).toBeNull();
    });

    it.each([[undefined], [null]])('AC-01.8 templateKey %p ⇒ lưu null', async (templateKey) => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED, templateKey });
      expect(createdData().templateKey).toBeNull();
    });

    it('AC-01.8 templateKey MỒ CÔI (không mẫu nào mang khóa đó) vẫn được lưu nguyên văn', async () => {
      prisma.criteria.findFirst.mockResolvedValue(null);
      await service.createFromJson({ courseId: 5, rubric: AUTHORED, templateKey: 'mau_da_bi_xoa' });
      expect(createdData().templateKey).toBe('mau_da_bi_xoa');
      // BR-07: KHÔNG bao giờ tra cứu sự tồn tại của mẫu.
      expect(prisma.rubricTemplate.findUnique).not.toHaveBeenCalled();
      expect(prisma.rubricTemplate.findMany).not.toHaveBeenCalled();
    });

    it.each([['Hoa_Thuong'], ['co khoang trang'], ['co-gach'], [''], ['_batdau'], [42], [{}], [[]]])(
      'AC-01.8 templateKey %p ⇒ 400 "invalid template key", không tạo hàng',
      async (templateKey) => {
        await expect(
          service.createFromJson({ courseId: 5, rubric: AUTHORED, templateKey } as never),
        ).rejects.toThrow(new BadRequestException('invalid template key'));
        expect(prisma.criteria.create).not.toHaveBeenCalled();
      },
    );

    it('AC-01.9 khóa học không tồn tại ⇒ 404 "course not found", không tạo hàng', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(service.createFromJson({ courseId: 999, rubric: AUTHORED })).rejects.toThrow(
        new NotFoundException('course not found'),
      );
      expect(prisma.criteria.create).not.toHaveBeenCalled();
    });

    /**
     * AC-01.2/AC-01.3 — CHỨNG MINH BẰNG HÀNH VI rằng `assertAuthorableRubric` chạy trên body THÔ.
     * Nếu ai đó chèn `normalizeRubric` vào trước nó (đúng lỗi DEF-1 của F10), `step` sẽ bị vá về 1
     * và cả ba ca dưới đây trả về 201 kèm một hàng mới — nên chúng đỏ.
     */
    describe('AC-01.3 cổng rubric chạy trên giá trị THÔ (chống tái diễn F10 DEF-1)', () => {
      it.each([[0], [-1]])('scale.step = %p ⇒ 400 "scale.step must be greater than 0"', async (step) => {
        await expect(
          service.createFromJson({ courseId: 5, rubric: { ...AUTHORED, scale: { min: 0, max: 5, step } } }),
        ).rejects.toThrow(new BadRequestException('scale.step must be greater than 0'));
        expect(prisma.criteria.create).not.toHaveBeenCalled();
      });

      it.each([[null], ['x']])('scale.step = %p ⇒ 400 "scale.step must be a finite number"', async (step) => {
        await expect(
          service.createFromJson({ courseId: 5, rubric: { ...AUTHORED, scale: { min: 0, max: 5, step } } }),
        ).rejects.toThrow(new BadRequestException('scale.step must be a finite number'));
        expect(prisma.criteria.create).not.toHaveBeenCalled();
      });

      it('scale = 42 ⇒ 400 "scale must be an object with numeric min, max and step"', async () => {
        await expect(
          service.createFromJson({ courseId: 5, rubric: { ...AUTHORED, scale: 42 } }),
        ).rejects.toThrow(
          new BadRequestException('scale must be an object with numeric min, max and step'),
        );
        expect(prisma.criteria.create).not.toHaveBeenCalled();
      });

      it('cổng rubric chạy TRƯỚC cả việc tra khóa học ⇒ rubric hỏng không chạm tới DB', async () => {
        await expect(
          service.createFromJson({ courseId: 5, rubric: { ...AUTHORED, scale: { min: 0, max: 5, step: 0 } } }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.course.findUnique).not.toHaveBeenCalled();
        expect(prisma.criteria.findFirst).not.toHaveBeenCalled();
      });
    });

    it.each([[undefined], [null], [42], ['x'], [[]], [{}]])(
      'AC-01.10 rubric %p ⇒ 400 (không bao giờ 500), không tạo hàng',
      async (rubric) => {
        await expect(service.createFromJson({ courseId: 5, rubric })).rejects.toThrow(BadRequestException);
        expect(prisma.criteria.create).not.toHaveBeenCalled();
      },
    );

    it('AC-01.10 rubric vắng mặt hoàn toàn ⇒ 400 "rubric must declare at least one dimension"', async () => {
      await expect(service.createFromJson({ courseId: 5 })).rejects.toThrow(
        new BadRequestException('rubric must declare at least one dimension'),
      );
    });

    it('AC-01.11/BR-05 đường ghi này KHÔNG bao giờ update/upsert một hàng criteria có sẵn', async () => {
      prisma.criteria.findFirst.mockResolvedValue({ version: 3 });
      await service.createFromJson({ courseId: 5, rubric: AUTHORED });
      for (const method of ['update', 'updateMany', 'upsert', 'delete', 'deleteMany'] as const) {
        expect(prisma.criteria[method]).not.toHaveBeenCalled();
      }
    });
  });
});
