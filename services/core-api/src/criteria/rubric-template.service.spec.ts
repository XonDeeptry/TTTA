import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { normalizeRubric } from './rubric-schema';
import { RubricTemplateService } from './rubric-template.service';
import { CAMBRIDGE_YL_SEED, IELTS_SPEAKING_SEED } from './templates';

/**
 * F10 FR-12…FR-18 + xóa (bảng §6 dòng 6).
 *
 * Prisma được giả lập bằng một "bảng" trong bộ nhớ đủ thật để chứng minh HÀNH VI (409/404/204,
 * ẩn/hiện, reset về seed) chứ không chỉ chứng minh "service có gọi prisma".
 */

interface Row {
  id: number;
  key: string;
  name: string;
  rubric: unknown;
  locked: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makePrisma(seedRows: Row[] = []) {
  const rows: Row[] = seedRows.map((row) => ({ ...row }));
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  // Đồng hồ giả LUÔN đi sau mọi `createdAt`/`updatedAt` có sẵn, để "updatedAt tiến lên" là một
  // khẳng định có nghĩa chứ không phải may rủi theo mốc thời gian của fixture.
  let clock = rows.reduce((max, row) => Math.max(max, row.updatedAt.getTime(), row.createdAt.getTime()), 0);

  const findUnique = jest.fn(async ({ where }: { where: { key: string } }) => {
    const found = rows.find((row) => row.key === where.key);
    return found ? { ...found } : null;
  });

  return {
    rows,
    prisma: {
      rubricTemplate: {
        findUnique,
        findMany: jest.fn(
          async ({ where, orderBy }: { where?: { isActive?: boolean }; orderBy?: unknown }) => {
            void orderBy;
            const filtered =
              where?.isActive === undefined ? rows : rows.filter((row) => row.isActive === where.isActive);
            // Bản giả tái hiện `[{isSystem:'desc'},{key:'asc'}]` của service.
            return [...filtered]
              .sort((a, b) =>
                a.isSystem === b.isSystem ? a.key.localeCompare(b.key) : a.isSystem ? -1 : 1,
              )
              .map((row) => ({ ...row }));
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (rows.some((row) => row.key === data.key)) throw { code: 'P2002' };
          clock += 1;
          const row: Row = {
            id: nextId++,
            key: data.key as string,
            name: data.name as string,
            rubric: data.rubric,
            locked: (data.locked as string[]) ?? [],
            isSystem: (data.isSystem as boolean) ?? false,
            isActive: (data.isActive as boolean) ?? true,
            createdAt: new Date(clock),
            updatedAt: new Date(clock),
          };
          rows.push(row);
          return { ...row };
        }),
        update: jest.fn(
          async ({ where, data }: { where: { key: string }; data: Record<string, unknown> }) => {
            const row = rows.find((r) => r.key === where.key);
            if (!row) throw { code: 'P2025' };
            clock += 1;
            if (data.name !== undefined) row.name = data.name as string;
            if (data.rubric !== undefined) row.rubric = data.rubric;
            if (data.locked !== undefined) row.locked = data.locked as string[];
            if (data.isActive !== undefined) row.isActive = data.isActive as boolean;
            row.updatedAt = new Date(clock);
            return { ...row };
          },
        ),
        delete: jest.fn(async ({ where }: { where: { key: string } }) => {
          const index = rows.findIndex((row) => row.key === where.key);
          if (index < 0) throw { code: 'P2025' };
          const [removed] = rows.splice(index, 1);
          return { ...removed };
        }),
      },
    },
  };
}

function systemRow(key: string, over: Partial<Row> = {}): Row {
  const seed = key === 'ielts_speaking' ? IELTS_SPEAKING_SEED : CAMBRIDGE_YL_SEED;
  return {
    id: key === 'ielts_speaking' ? 2 : 1,
    key,
    name: seed.name,
    rubric: JSON.parse(JSON.stringify(seed.rubric)) as unknown,
    locked: [...seed.locked],
    isSystem: true,
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...over,
  };
}

function ordinaryRow(key: string, over: Partial<Row> = {}): Row {
  return {
    id: 10,
    key,
    name: `Mẫu ${key}`,
    rubric: JSON.parse(JSON.stringify(CAMBRIDGE_YL_SEED.rubric)) as unknown,
    locked: [],
    isSystem: false,
    isActive: true,
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    ...over,
  };
}

async function rejection(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (err) {
    return err as HttpException;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

const VALID_BODY = {
  key: 'writing_internal',
  name: 'Writing nội bộ',
  rubric: CAMBRIDGE_YL_SEED.rubric as unknown as Record<string, unknown>,
};

describe('FR-12 — GET /criteria/templates (liệt kê)', () => {
  it('AC-12.2 mặc định chỉ trả mẫu đang hiện', async () => {
    const { prisma } = makePrisma([
      systemRow('cambridge_yl_a0_a2'),
      ordinaryRow('an_di', { isActive: false }),
    ]);
    const service = new RubricTemplateService(prisma as never);
    const result = await service.list(undefined);
    expect(result.map((t) => t.key)).toEqual(['cambridge_yl_a0_a2']);
  });

  it('AC-12.3 includeInactive nhận "true" và "1"; giá trị khác ⇒ LOẠI, không bao giờ 400', async () => {
    const { prisma } = makePrisma([
      systemRow('cambridge_yl_a0_a2'),
      ordinaryRow('an_di', { isActive: false }),
    ]);
    const service = new RubricTemplateService(prisma as never);
    expect((await service.list('true')).map((t) => t.key)).toEqual(['cambridge_yl_a0_a2', 'an_di']);
    expect((await service.list('1')).map((t) => t.key)).toEqual(['cambridge_yl_a0_a2', 'an_di']);
    for (const value of ['false', '0', 'yes', 'TRUE', '', 'rác']) {
      await expect(service.list(value)).resolves.toHaveLength(1);
    }
  });

  it('AC-12.4 thứ tự tất định isSystem DESC, key ASC — hai mẫu mặc định đứng đầu', async () => {
    const { prisma } = makePrisma([
      ordinaryRow('aaa_dau_bang', { id: 20 }),
      systemRow('ielts_speaking'),
      ordinaryRow('zzz_cuoi_bang', { id: 21 }),
      systemRow('cambridge_yl_a0_a2'),
    ]);
    const service = new RubricTemplateService(prisma as never);
    expect((await service.list(undefined)).map((t) => t.key)).toEqual([
      'cambridge_yl_a0_a2',
      'ielts_speaking',
      'aaa_dau_bang',
      'zzz_cuoi_bang',
    ]);
  });

  it('AC-12.5 mỗi phần tử đúng shape §6.2 và rubric đã chuẩn hóa lúc đọc', async () => {
    // Hàng bị sửa tay trong DB thành rubric v1 — GET vẫn phải trả v2 đúng hình.
    const { prisma } = makePrisma([
      ordinaryRow('cu_v1', { rubric: { band_scale: [0, 3], dimensions: [{ name: 'pronunciation' }] } }),
    ]);
    const service = new RubricTemplateService(prisma as never);
    const [item] = await service.list(undefined);
    expect(Object.keys(item).sort()).toEqual([
      'createdAt',
      'id',
      'isActive',
      'isSystem',
      'key',
      'locked',
      'name',
      'rubric',
      'updatedAt',
    ]);
    expect(item.rubric.schema_version).toBe(2);
    expect(item.rubric.scale).toEqual({ min: 0, max: 3, step: 1 });
    expect(Object.keys(item.rubric)).toHaveLength(12);
  });

  it('AC-12.6 bảng rỗng ⇒ [] chứ không 404', async () => {
    const { prisma } = makePrisma([]);
    await expect(new RubricTemplateService(prisma as never).list(undefined)).resolves.toEqual([]);
  });
});

describe('FR-13 — GET /criteria/templates/:key (chi tiết)', () => {
  it('AC-13.1 trả cả mẫu đang ẩn và mẫu hệ thống', async () => {
    const { prisma } = makePrisma([
      systemRow('cambridge_yl_a0_a2', { isActive: false }),
    ]);
    const service = new RubricTemplateService(prisma as never);
    const item = await service.get('cambridge_yl_a0_a2');
    expect(item.isActive).toBe(false);
    expect(item.isSystem).toBe(true);
  });

  it('AC-13.2 key lạ ⇒ 404 "template not found"', async () => {
    const { prisma } = makePrisma([]);
    const err = await rejection(new RubricTemplateService(prisma as never).get('khong_co'));
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.message).toBe('template not found');
  });

  it('AC-13.4 key trông như số vẫn được coi là CHUỖI ⇒ 404, không 400', async () => {
    const { prisma } = makePrisma([ordinaryRow('123')]);
    const service = new RubricTemplateService(prisma as never);
    await expect(service.get('123')).resolves.toMatchObject({ key: '123' });
    await expect(rejection(service.get('456'))).resolves.toBeInstanceOf(NotFoundException);
  });
});

describe('FR-14 — POST /criteria/templates (tạo mới)', () => {
  it('AC-14.3/14.4 isSystem luôn false; isActive mặc định true; locked mặc định []', async () => {
    const { prisma } = makePrisma([]);
    const created = await new RubricTemplateService(prisma as never).create({
      ...VALID_BODY,
      isSystem: true,
    } as never);
    expect(created.isSystem).toBe(false);
    expect(created.isActive).toBe(true);
    expect(created.locked).toEqual([]);
  });

  it('AC-14.5 rubric LƯU XUỐNG là bản đã normalize (điểm bất động v2 trên đĩa)', async () => {
    const { prisma, rows } = makePrisma([]);
    const created = await new RubricTemplateService(prisma as never).create({
      ...VALID_BODY,
      rubric: {
        band_scale: [0, 5],
        aggregation: { method: 'sum', round: 'none' },
        levels: [{ min: 0, max: 5, code: 'X', label: 'x' }],
        dimensions: [{ name: 'pronunciation', weight: 1 }],
        khoa_la: 'bi loai',
      } as never,
    });
    expect(Object.keys(rows[0].rubric as object)).toHaveLength(12);
    expect(rows[0].rubric).not.toHaveProperty('khoa_la');
    expect(created.rubric).toEqual(rows[0].rubric);
    expect(normalizeRubric(created.rubric)).toEqual(created.rubric);
  });

  it('AC-14.6 key trùng ⇒ 409 và KHÔNG tạo hàng nào', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('writing_internal')]);
    const err = await rejection(new RubricTemplateService(prisma as never).create(VALID_BODY as never));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('template key already exists');
    expect(rows).toHaveLength(1);
  });

  it('AC-14.6 trùng với mẫu ĐANG ẨN / mẫu HỆ THỐNG cũng là 409', async () => {
    for (const existing of [
      ordinaryRow('writing_internal', { isActive: false }),
      systemRow('writing_internal'),
    ]) {
      const { prisma } = makePrisma([existing]);
      const err = await rejection(new RubricTemplateService(prisma as never).create(VALID_BODY as never));
      expect(err).toBeInstanceOf(ConflictException);
    }
  });

  it('AC-14.6 đua song song: P2002 từ Postgres cũng thành 409', async () => {
    const { prisma } = makePrisma([]);
    prisma.rubricTemplate.create.mockRejectedValueOnce({ code: 'P2002' });
    const err = await rejection(new RubricTemplateService(prisma as never).create(VALID_BODY as never));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('template key already exists');
  });

  /**
   * QA fix round 1, DEF-1. Bộ test cũ chỉ gọi `assertAuthorableRubric` với rubric ĐÃ normalize —
   * một hình dạng mà đường ghi thật không bao giờ tạo ra — nên nhánh này xanh mà production vẫn
   * nhận `step: 0` rồi lưu thành 1. Các ca dưới đây đi qua ĐÚNG đường ghi (`service.create` /
   * `service.update`), nên không thể xanh giả lần nữa.
   */
  it.each([[0], [-1], [null], ['x']])(
    'DEF-1/AC-19.6 create với scale.step = %p ⇒ 400 và KHÔNG tạo hàng nào',
    async (step) => {
      const { prisma, rows } = makePrisma([]);
      const err = await rejection(
        new RubricTemplateService(prisma as never).create({
          ...VALID_BODY,
          rubric: { ...CAMBRIDGE_YL_SEED.rubric, scale: { min: 0, max: 5, step } } as never,
        }),
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect(rows).toHaveLength(0);
      expect(prisma.rubricTemplate.create).not.toHaveBeenCalled();
    },
  );

  it('DEF-1 thông điệp đúng luật bị vi phạm, không phải một 400 bất kỳ', async () => {
    const { prisma } = makePrisma([]);
    const service = new RubricTemplateService(prisma as never);
    const zero = await rejection(
      service.create({
        ...VALID_BODY,
        rubric: { ...CAMBRIDGE_YL_SEED.rubric, scale: { min: 0, max: 5, step: 0 } } as never,
      }),
    );
    expect(zero.message).toBe('scale.step must be greater than 0');
  });

  it('AC-14.10 rubric vi phạm FR-19 ⇒ 400 và KHÔNG tạo hàng nào', async () => {
    const { prisma, rows } = makePrisma([]);
    const err = await rejection(
      new RubricTemplateService(prisma as never).create({
        ...VALID_BODY,
        rubric: { schema_version: 2, dimensions: [{ key: 'fluency' }] } as never,
      }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
    expect(prisma.rubricTemplate.create).not.toHaveBeenCalled();
  });

  it('locked được khử trùng lặp trước khi lưu (§5.3)', async () => {
    const { prisma } = makePrisma([]);
    const created = await new RubricTemplateService(prisma as never).create({
      ...VALID_BODY,
      locked: ['scale', 'scale', 'levels'],
    } as never);
    expect(created.locked).toEqual(['scale', 'levels']);
  });
});

describe('FR-15 — POST /criteria/templates/:key/duplicate (nhân bản)', () => {
  it('AC-15.2 name mặc định "<tên nguồn> (bản sao)"', async () => {
    const { prisma } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const copy = await new RubricTemplateService(prisma as never).duplicate('cambridge_yl_a0_a2', {
      key: 'ban_sao',
    });
    expect(copy.name).toBe(`${CAMBRIDGE_YL_SEED.name} (bản sao)`);
  });

  it('AC-15.3/15.4 nhân bản mẫu HỆ THỐNG ⇒ bản sao là mẫu THƯỜNG, đang hiện, rubric/locked deep-equal', async () => {
    const { prisma } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const copy = await new RubricTemplateService(prisma as never).duplicate('cambridge_yl_a0_a2', {
      key: 'ban_sao',
      name: 'Bản sao của tôi',
    });
    expect(copy.isSystem).toBe(false);
    expect(copy.isActive).toBe(true);
    expect(copy.rubric).toEqual(CAMBRIDGE_YL_SEED.rubric);
    expect(copy.locked).toEqual(CAMBRIDGE_YL_SEED.locked);
  });

  it('AC-15.4 bản sao là BẢN SAO SÂU — sửa nó không đụng JSON của nguồn', async () => {
    const { prisma, rows } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const service = new RubricTemplateService(prisma as never);
    await service.duplicate('cambridge_yl_a0_a2', { key: 'ban_sao' });

    const sourceBefore = JSON.stringify(rows[0].rubric);
    const copyRubric = rows[1].rubric as { scale: { max: number } };
    copyRubric.scale.max = 999;
    expect(JSON.stringify(rows[0].rubric)).toBe(sourceBefore);
  });

  it('AC-15.5 bản sao của mẫu hệ thống XÓA ĐƯỢC (thiết kế mục 10 ý 3)', async () => {
    const { prisma, rows } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const service = new RubricTemplateService(prisma as never);
    await service.duplicate('cambridge_yl_a0_a2', { key: 'ban_sao' });
    await expect(service.remove('ban_sao')).resolves.toBeUndefined();
    expect(rows.map((r) => r.key)).toEqual(['cambridge_yl_a0_a2']);
  });

  it('AC-15.6 nguồn không tồn tại ⇒ 404, không tạo gì', async () => {
    const { prisma, rows } = makePrisma([]);
    const err = await rejection(
      new RubricTemplateService(prisma as never).duplicate('khong_co', { key: 'ban_sao' }),
    );
    expect(err).toBeInstanceOf(NotFoundException);
    expect(rows).toHaveLength(0);
  });

  it('AC-15.7 key mới đã bị chiếm ⇒ 409, không tạo gì', async () => {
    const { prisma, rows } = makePrisma([systemRow('cambridge_yl_a0_a2'), ordinaryRow('ban_sao')]);
    const err = await rejection(
      new RubricTemplateService(prisma as never).duplicate('cambridge_yl_a0_a2', { key: 'ban_sao' }),
    );
    expect(err).toBeInstanceOf(ConflictException);
    expect(rows).toHaveLength(2);
  });

  it('AC-15.8 nguồn đang ẨN vẫn nhân bản được, bản sao đang HIỆN', async () => {
    const { prisma } = makePrisma([ordinaryRow('an_di', { isActive: false })]);
    const copy = await new RubricTemplateService(prisma as never).duplicate('an_di', { key: 'ban_sao' });
    expect(copy.isActive).toBe(true);
  });

  it('AC-15.9 KHÔNG chạy lại FR-19 — hàng bị sửa tay thành rubric xấu vẫn nhân bản được', async () => {
    const { prisma } = makePrisma([
      ordinaryRow('xau', { rubric: { schema_version: 2, dimensions: [{ key: 'fluency' }] } }),
    ]);
    const copy = await new RubricTemplateService(prisma as never).duplicate('xau', { key: 'ban_sao' });
    expect(copy.key).toBe('ban_sao');
    // …nhưng vẫn được normalize như mọi đường ghi khác.
    expect(Object.keys(copy.rubric)).toHaveLength(12);
  });
});

describe('FR-16 — PUT /criteria/templates/:key (sửa)', () => {
  it('AC-16.2/16.10 trường vắng mặt KHÔNG bị ghi; đổi mỗi name thì rubric giữ nguyên từng byte', async () => {
    const { prisma, rows } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const before = JSON.stringify(rows[0].rubric);
    const updated = await new RubricTemplateService(prisma as never).update('cambridge_yl_a0_a2', {
      name: 'Tên mới',
    });
    expect(updated.name).toBe('Tên mới');
    expect(JSON.stringify(rows[0].rubric)).toBe(before);
    const arg = prisma.rubricTemplate.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.rubric).toBeUndefined();
    expect(arg.data.locked).toBeUndefined();
  });

  it('AC-16.3 mẫu HỆ THỐNG sửa được MỌI trường, kể cả trường nằm trong `locked` của chính nó', async () => {
    const { prisma } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const updated = await new RubricTemplateService(prisma as never).update('cambridge_yl_a0_a2', {
      name: 'Cambridge sửa lại',
      rubric: {
        ...IELTS_SPEAKING_SEED.rubric,
      } as unknown as Record<string, unknown>,
      locked: ['student_reply'],
    });
    // `scale` nằm trong locked mặc định — vẫn đổi được từ 0–5 sang 0–9.
    expect(updated.rubric.scale).toEqual({ min: 0, max: 9, step: 1 });
    expect(updated.locked).toEqual(['student_reply']);
    expect(updated.isSystem).toBe(true);
  });

  it('AC-16.4 key khác path ⇒ 400 "template key is immutable"; key trùng path ⇒ bỏ qua', async () => {
    const { prisma } = makePrisma([ordinaryRow('cu')]);
    const service = new RubricTemplateService(prisma as never);
    const err = await rejection(service.update('cu', { key: 'moi', name: 'x' }));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('template key is immutable');
    expect(prisma.rubricTemplate.update).not.toHaveBeenCalled();

    await expect(service.update('cu', { key: 'cu', name: 'x' })).resolves.toMatchObject({
      key: 'cu',
      name: 'x',
    });
  });

  it('AC-16.6 key lạ ⇒ 404', async () => {
    const { prisma } = makePrisma([]);
    const err = await rejection(new RubricTemplateService(prisma as never).update('khong_co', { name: 'x' }));
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('AC-16.7 rubric vi phạm FR-19 ⇒ 400 và KHÔNG cột nào được ghi', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('t')]);
    const before = JSON.stringify(rows[0]);
    const err = await rejection(
      new RubricTemplateService(prisma as never).update('t', {
        name: 'ten-moi-khong-duoc-ghi',
        rubric: { schema_version: 2, scale: { min: 0, max: 0, step: 1 } } as never,
      }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(prisma.rubricTemplate.update).not.toHaveBeenCalled();
    expect(JSON.stringify(rows[0])).toBe(before);
  });

  it('DEF-1/AC-19.6 update với scale.step = 0 ⇒ 400 và KHÔNG cột nào được ghi', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('t')]);
    const before = JSON.stringify(rows[0]);
    const err = await rejection(
      new RubricTemplateService(prisma as never).update('t', {
        name: 'khong-duoc-ghi',
        rubric: { ...CAMBRIDGE_YL_SEED.rubric, scale: { min: 0, max: 5, step: 0 } } as never,
      }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('scale.step must be greater than 0');
    expect(prisma.rubricTemplate.update).not.toHaveBeenCalled();
    expect(JSON.stringify(rows[0])).toBe(before);
  });

  it('AC-16.8 updatedAt tiến lên; createdAt và isSystem không đổi', async () => {
    const { prisma, rows } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const createdAt = rows[0].createdAt;
    const updatedAtBefore = rows[0].updatedAt;
    const updated = await new RubricTemplateService(prisma as never).update('cambridge_yl_a0_a2', {
      name: 'x',
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(updatedAtBefore.getTime());
    expect(updated.createdAt).toEqual(createdAt);
    expect(updated.isSystem).toBe(true);
  });

  it('AC-16.9 sửa mẫu hệ thống rồi khởi động lại KHÔNG bị hoàn nguyên — GET trả bản đã sửa', async () => {
    const { prisma } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const service = new RubricTemplateService(prisma as never);
    await service.update('cambridge_yl_a0_a2', { name: 'Bản của trung tâm' });
    await expect(service.get('cambridge_yl_a0_a2')).resolves.toMatchObject({
      name: 'Bản của trung tâm',
    });
  });
});

describe('Xóa — DELETE /criteria/templates/:key (bảng §6 dòng 6)', () => {
  it('AC-D.1 mẫu thường ⇒ xóa thật', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('t')]);
    await expect(new RubricTemplateService(prisma as never).remove('t')).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it('AC-D.2 mẫu hệ thống ⇒ 409 và hàng VẪN ĐỌC ĐƯỢC', async () => {
    const { prisma, rows } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const service = new RubricTemplateService(prisma as never);
    const err = await rejection(service.remove('cambridge_yl_a0_a2'));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('system templates cannot be deleted');
    expect(rows).toHaveLength(1);
    await expect(service.get('cambridge_yl_a0_a2')).resolves.toMatchObject({ isSystem: true });
    expect(prisma.rubricTemplate.delete).not.toHaveBeenCalled();
  });

  it('AC-D.3 key lạ ⇒ 404', async () => {
    const { prisma } = makePrisma([]);
    await expect(rejection(new RubricTemplateService(prisma as never).remove('x'))).resolves.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('FR-17 — PATCH /criteria/templates/:key/active (ẩn / hiện)', () => {
  it('AC-17.3/17.4 ẩn mẫu HỆ THỐNG ⇒ biến khỏi danh sách mặc định, còn thấy với includeInactive và qua GET :key', async () => {
    const { prisma } = makePrisma([systemRow('cambridge_yl_a0_a2')]);
    const service = new RubricTemplateService(prisma as never);
    const updated = await service.setActive('cambridge_yl_a0_a2', false);
    expect(updated.isActive).toBe(false);
    expect(await service.list(undefined)).toEqual([]);
    expect((await service.list('true')).map((t) => t.key)).toEqual(['cambridge_yl_a0_a2']);
    await expect(service.get('cambridge_yl_a0_a2')).resolves.toMatchObject({ isActive: false });
  });

  it('AC-17.6 key lạ ⇒ 404; đặt lại đúng giá trị đang có ⇒ vẫn 200 (idempotent)', async () => {
    const { prisma } = makePrisma([ordinaryRow('t')]);
    const service = new RubricTemplateService(prisma as never);
    await expect(rejection(service.setActive('x', false))).resolves.toBeInstanceOf(NotFoundException);
    await expect(service.setActive('t', true)).resolves.toMatchObject({ isActive: true });
    await expect(service.setActive('t', true)).resolves.toMatchObject({ isActive: true });
  });

  it('AC-17.5 ẩn/hiện chỉ đụng cột is_active, không đụng rubric/name/locked', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('t')]);
    const before = { rubric: JSON.stringify(rows[0].rubric), name: rows[0].name, locked: [...rows[0].locked] };
    await new RubricTemplateService(prisma as never).setActive('t', false);
    expect(JSON.stringify(rows[0].rubric)).toBe(before.rubric);
    expect(rows[0].name).toBe(before.name);
    expect(rows[0].locked).toEqual(before.locked);
  });
});

describe('FR-18 — POST /criteria/templates/:key/reset (khôi phục bản gốc)', () => {
  it('AC-18.2/18.4 sửa lung tung rồi reset ⇒ name/rubric/locked bằng seed; isActive/id/createdAt giữ nguyên', async () => {
    const { prisma, rows } = makePrisma([
      systemRow('cambridge_yl_a0_a2', {
        name: 'Đã đổi tên',
        rubric: { schema_version: 2, dimensions: [] },
        locked: [],
        isActive: false,
      }),
    ]);
    const service = new RubricTemplateService(prisma as never);
    const restored = await service.reset('cambridge_yl_a0_a2');

    expect(restored.name).toBe(CAMBRIDGE_YL_SEED.name);
    expect(restored.rubric).toEqual(CAMBRIDGE_YL_SEED.rubric);
    expect(restored.locked).toEqual(CAMBRIDGE_YL_SEED.locked);
    // D-4: isActive là trạng thái VẬN HÀNH, cố ý không khôi phục.
    expect(restored.isActive).toBe(false);
    expect(restored.isSystem).toBe(true);
    expect(restored.id).toBe(1);
    expect(restored.createdAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(rows).toHaveLength(1);
  });

  it('AC-18.4/06.5 reset lần hai ra hàng Y HỆT (seed không bị sửa giữa chừng)', async () => {
    const { prisma } = makePrisma([systemRow('cambridge_yl_a0_a2', { name: 'x', locked: [] })]);
    const service = new RubricTemplateService(prisma as never);
    const first = await service.reset('cambridge_yl_a0_a2');
    const second = await service.reset('cambridge_yl_a0_a2');
    expect(second.name).toBe(first.name);
    expect(second.rubric).toEqual(first.rubric);
    expect(second.locked).toEqual(first.locked);
    expect(second.rubric).toEqual(CAMBRIDGE_YL_SEED.rubric);
  });

  it('AC-18.2 rubric ghi xuống là bản sao SÂU — sửa hàng sau reset không làm bẩn seed', async () => {
    const { prisma, rows } = makePrisma([systemRow('ielts_speaking', { name: 'x' })]);
    await new RubricTemplateService(prisma as never).reset('ielts_speaking');
    (rows[0].rubric as { scale: { max: number } }).scale.max = 42;
    expect(IELTS_SPEAKING_SEED.rubric.scale.max).toBe(9);
  });

  it('AC-18.3 mẫu THƯỜNG ⇒ 409, hàng không đổi', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('t')]);
    const before = JSON.stringify(rows[0]);
    const err = await rejection(new RubricTemplateService(prisma as never).reset('t'));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('reset is only available for system templates');
    expect(JSON.stringify(rows[0])).toBe(before);
  });

  it('AC-18.5 key lạ ⇒ 404', async () => {
    const { prisma } = makePrisma([]);
    await expect(rejection(new RubricTemplateService(prisma as never).reset('x'))).resolves.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('AC-18.6 isSystem = true nhưng không có seed ⇒ 409 có nghĩa, KHÔNG 500', async () => {
    const { prisma, rows } = makePrisma([ordinaryRow('mau_ma', { isSystem: true })]);
    const before = JSON.stringify(rows[0]);
    const err = await rejection(new RubricTemplateService(prisma as never).reset('mau_ma'));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('no seed definition for this template');
    expect(JSON.stringify(rows[0])).toBe(before);
  });
});
