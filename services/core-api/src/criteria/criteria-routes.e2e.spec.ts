import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'net';
import { PrismaService } from '../prisma.service';
import { CriteriaController } from './criteria.controller';
import { CriteriaService } from './criteria.service';
import { RubricTemplateService } from './rubric-template.service';
import { CAMBRIDGE_YL_SEED } from './templates';
import '../auth/session.types';

/**
 * F10 FR-20 + FR-09 — kiểm HÀNH VI THẬT qua HTTP, không phải đọc code.
 *
 * Vì sao phải dựng cả một Nest app thay vì gọi thẳng controller? Vì thứ đang được kiểm CHÍNH LÀ
 * bộ định tuyến: `@Get(':id')` dùng `ParseIntPipe`, nên nếu nó bị khai báo TRƯỚC khối `templates*`
 * thì `GET /criteria/templates` sẽ trả 400 "Validation failed (numeric string is expected)".
 * Gọi thẳng method của controller KHÔNG BAO GIỜ phát hiện được lỗi đó (AC-20.2 nói rõ: hãy khẳng
 * định 200, không phải "không thấy 400").
 *
 * Không thêm dependency nào: `@nestjs/core` + `@nestjs/platform-express` đã là runtime dep, còn
 * `fetch` là hàm toàn cục của Node 18+ (AC-22.2).
 */

interface SessionUser {
  id: number;
  email: string;
  role: 'admin' | 'staff';
  mustChangePassword: boolean;
}

/** Ai đang "đăng nhập" trong request kế tiếp; `undefined` = chưa đăng nhập. */
let currentUser: SessionUser | undefined;
/** Hàng `dashboard_users` mà PrivilegeGuard sẽ đọc được. */
let dbUser: { role: string; privileges: string[] } | null = null;

const templateRow = {
  id: 1,
  key: 'cambridge_yl_a0_a2',
  name: CAMBRIDGE_YL_SEED.name,
  rubric: CAMBRIDGE_YL_SEED.rubric as unknown,
  locked: [...CAMBRIDGE_YL_SEED.locked],
  isSystem: true,
  isActive: true,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

const ordinaryRow = { ...templateRow, id: 2, key: 'writing_internal', name: 'Writing', isSystem: false };

const criteriaRow = {
  id: 7,
  courseId: 3,
  title: 'KID',
  rubric: CAMBRIDGE_YL_SEED.rubric as unknown,
  sourceFilename: null,
  version: 1,
  templateKey: null,
  createdAt: new Date('2026-08-10T00:00:00.000Z'),
};

function makePrisma() {
  const rows = [templateRow, ordinaryRow];
  return {
    dashboardUser: { findUnique: jest.fn(async () => (dbUser ? { ...dbUser } : null)) },
    rubricTemplate: {
      findMany: jest.fn(async () => rows.map((r) => ({ ...r }))),
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
        const found = rows.find((r) => r.key === where.key);
        return found ? { ...found } : null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...templateRow,
        ...data,
        id: 99,
      })),
      // Prisma BỎ QUA mọi khóa có giá trị `undefined`; bản giả phải hành xử y hệt, nếu không
      // `{...row, rubric: undefined}` sẽ biến thành một hàng thiếu cột và che mất lỗi thật.
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        return { ...ordinaryRow, ...defined };
      }),
      delete: jest.fn(async () => ({ ...ordinaryRow })),
    },
    criteria: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === 7 ? { ...criteriaRow } : null,
      ),
      findMany: jest.fn(async () => [{ ...criteriaRow }]),
      findFirst: jest.fn(async () => ({ ...criteriaRow })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...criteriaRow,
        ...data,
        id: 77,
      })),
    },
    // F12: `POST /criteria/json` kiểm khóa học tồn tại (AC-01.9). `courseId` 3 có, mọi id khác không.
    course: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === 3 ? { id: 3 } : null,
      ),
    },
  };
}

/** Bản mock đang chạy — để test khẳng định "KHÔNG có hàng nào được tạo" sau một 400. */
let prismaMock: ReturnType<typeof makePrisma>;

let app: NestExpressApplication;
let baseUrl: string;

interface Response {
  status: number;
  body: unknown;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    // `connection: close` để undici không giữ socket keep-alive sau khi suite kết thúc —
    // nếu không jest báo "a worker process has failed to exit gracefully".
    headers:
      body === undefined
        ? { connection: 'close' }
        : { 'content-type': 'application/json', connection: 'close' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    /* giữ nguyên text */
  }
  return { status: res.status, body: parsed };
}

function loginAs(user: SessionUser | undefined, row: { role: string; privileges: string[] } | null): void {
  currentUser = user;
  dbUser = row;
}

const ADMIN: SessionUser = { id: 1, email: 'admin@ilm.local', role: 'admin', mustChangePassword: false };
const STAFF: SessionUser = { id: 2, email: 'staff@ilm.local', role: 'staff', mustChangePassword: false };

beforeAll(async () => {
  const prisma = makePrisma();
  prismaMock = prisma;

  @Module({
    controllers: [CriteriaController],
    providers: [
      CriteriaService,
      RubricTemplateService,
      { provide: PrismaService, useValue: prisma },
    ],
  })
  class TestModule {}

  app = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
  // Session giả: chèn TRƯỚC router để SessionAuthGuard/PrivilegeGuard đọc được.
  app.use((req: { session?: unknown }, _res: unknown, next: () => void) => {
    req.session = currentUser ? { user: currentUser } : {};
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // y hệt main.ts
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  loginAs(ADMIN, { role: 'admin', privileges: [] });
  prismaMock?.criteria.create.mockClear();
});

describe('FR-20 — thứ tự route: mọi route chữ phải đứng TRƯỚC @Get(":id")', () => {
  it('AC-20.2 GET /criteria/templates ⇒ 200 + MẢNG (không phải 400 của ParseIntPipe)', async () => {
    const res = await call('GET', '/criteria/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('numeric string is expected');
  });

  it('AC-20.3 GET /criteria/templates/:key ⇒ 200', async () => {
    const res = await call('GET', '/criteria/templates/cambridge_yl_a0_a2');
    expect(res.status).toBe(200);
    expect((res.body as { key: string }).key).toBe('cambridge_yl_a0_a2');
  });

  it('AC-20.3 POST /criteria/templates ⇒ 201', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'moi_tinh',
      name: 'Mẫu mới',
      rubric: CAMBRIDGE_YL_SEED.rubric,
    });
    expect(res.status).toBe(201);
  });

  it('AC-20.3 POST /criteria/templates/:key/duplicate ⇒ 201', async () => {
    const res = await call('POST', '/criteria/templates/cambridge_yl_a0_a2/duplicate', { key: 'ban_sao_1' });
    expect(res.status).toBe(201);
  });

  it('AC-20.3 PUT /criteria/templates/:key ⇒ 200', async () => {
    const res = await call('PUT', '/criteria/templates/writing_internal', { name: 'Tên mới' });
    expect(res.status).toBe(200);
  });

  it('AC-20.3 DELETE /criteria/templates/:key ⇒ 204', async () => {
    const res = await call('DELETE', '/criteria/templates/writing_internal');
    expect(res.status).toBe(204);
  });

  it('AC-20.3 PATCH /criteria/templates/:key/active ⇒ 200', async () => {
    const res = await call('PATCH', '/criteria/templates/writing_internal/active', { isActive: false });
    expect(res.status).toBe(200);
  });

  it('AC-20.3 POST /criteria/templates/:key/reset ⇒ 200 (mẫu hệ thống)', async () => {
    const res = await call('POST', '/criteria/templates/cambridge_yl_a0_a2/reset');
    expect(res.status).toBe(200);
  });

  it('AC-20.4 GET /criteria/7 vẫn vào handler số; GET /criteria/abc vẫn 400 của ParseIntPipe', async () => {
    const numeric = await call('GET', '/criteria/7');
    expect(numeric.status).toBe(200);
    expect((numeric.body as { id: number }).id).toBe(7);

    const alpha = await call('GET', '/criteria/abc');
    expect(alpha.status).toBe(400);
    expect(JSON.stringify(alpha.body)).toContain('numeric string is expected');
  });

  it('AC-13.4 GET /criteria/templates/123 ⇒ 404 "template not found", KHÔNG 400', async () => {
    const res = await call('GET', '/criteria/templates/123');
    expect(res.status).toBe(404);
    expect((res.body as { message: string }).message).toBe('template not found');
  });
});

describe('FR-12/FR-13 — đọc mở cho mọi staff (AC-12.1, AC-13.3, NFR-S1)', () => {
  it('staff với privileges = [] vẫn 200 trên cả liệt kê lẫn chi tiết', async () => {
    loginAs(STAFF, { role: 'staff', privileges: [] });
    await expect(call('GET', '/criteria/templates')).resolves.toMatchObject({ status: 200 });
    await expect(call('GET', '/criteria/templates/cambridge_yl_a0_a2')).resolves.toMatchObject({
      status: 200,
    });
  });

  it('AC-09.2 staff với privileges = [] vẫn đọc được /criteria và /criteria/:id', async () => {
    loginAs(STAFF, { role: 'staff', privileges: [] });
    await expect(call('GET', '/criteria?courseId=3')).resolves.toMatchObject({ status: 200 });
    await expect(call('GET', '/criteria/7')).resolves.toMatchObject({ status: 200 });
  });

  it('AC-12.7 chưa đăng nhập ⇒ 401 "login required"', async () => {
    loginAs(undefined, null);
    const res = await call('GET', '/criteria/templates');
    expect(res.status).toBe(401);
    expect((res.body as { message: string }).message).toBe('login required');
  });
});

describe('FR-09/FR-14 — ma trận phân quyền trên đường GHI', () => {
  const WRITE_ROUTES: Array<[string, string, unknown]> = [
    ['POST', '/criteria/templates', { key: 'k_moi', name: 'n', rubric: CAMBRIDGE_YL_SEED.rubric }],
    ['POST', '/criteria/templates/cambridge_yl_a0_a2/duplicate', { key: 'k_moi_2' }],
    ['PUT', '/criteria/templates/writing_internal', { name: 'n' }],
    ['DELETE', '/criteria/templates/writing_internal', undefined],
    ['PATCH', '/criteria/templates/writing_internal/active', { isActive: false }],
    ['POST', '/criteria/templates/cambridge_yl_a0_a2/reset', undefined],
  ];

  it.each(WRITE_ROUTES)('AC-14.11 %s %s: staff + [] ⇒ 403 "insufficient privilege"', async (method, path, body) => {
    loginAs(STAFF, { role: 'staff', privileges: [] });
    const res = await call(method, path, body);
    expect(res.status).toBe(403);
    expect((res.body as { message: string }).message).toBe('insufficient privilege');
  });

  it.each(WRITE_ROUTES)('AC-14.11 %s %s: staff chỉ có criteria_author ⇒ 403', async (method, path, body) => {
    loginAs(STAFF, { role: 'staff', privileges: ['criteria_author'] });
    expect((await call(method, path, body)).status).toBe(403);
  });

  it.each(WRITE_ROUTES)('%s %s: staff có rubric_template ⇒ KHÔNG 401/403', async (method, path, body) => {
    loginAs(STAFF, { role: 'staff', privileges: ['rubric_template'] });
    const res = await call(method, path, body);
    expect([200, 201, 204, 409]).toContain(res.status);
  });

  it.each(WRITE_ROUTES)('%s %s: chưa đăng nhập ⇒ 401', async (method, path, body) => {
    loginAs(undefined, null);
    expect((await call(method, path, body)).status).toBe(401);
  });

  describe('AC-09.3 — POST /criteria (.docx) cần criteria_author', () => {
    // Không gửi file: guard chạy TRƯỚC interceptor, nên 403 chứng minh guard chặn, còn 400
    // "missing file field" chứng minh guard đã CHO QUA.
    it('admin ⇒ qua guard (400 vì thiếu file)', async () => {
      loginAs(ADMIN, { role: 'admin', privileges: [] });
      const res = await call('POST', '/criteria', { courseId: 3 });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe('missing file field "file" (.docx)');
    });

    it('staff + criteria_author ⇒ qua guard (AC-03.7: giáo viên cũ không mất quyền)', async () => {
      loginAs(STAFF, { role: 'staff', privileges: ['criteria_author'] });
      const res = await call('POST', '/criteria', { courseId: 3 });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe('missing file field "file" (.docx)');
    });

    it('staff chỉ có rubric_template ⇒ 403', async () => {
      loginAs(STAFF, { role: 'staff', privileges: ['rubric_template'] });
      expect((await call('POST', '/criteria', { courseId: 3 })).status).toBe(403);
    });

    it('staff + [] ⇒ 403', async () => {
      loginAs(STAFF, { role: 'staff', privileges: [] });
      expect((await call('POST', '/criteria', { courseId: 3 })).status).toBe(403);
    });

    it('chưa đăng nhập ⇒ 401', async () => {
      loginAs(undefined, null);
      expect((await call('POST', '/criteria', { courseId: 3 })).status).toBe(401);
    });
  });
});

describe('Validation qua HTTP (ValidationPipe y hệt main.ts)', () => {
  it('AC-14.7 key sai dạng ⇒ 400', async () => {
    for (const key of ['Hoa_Thuong', 'co khoang trang', 'co.cham', 'co-gach', '', '_batdau']) {
      const res = await call('POST', '/criteria/templates', {
        key,
        name: 'n',
        rubric: CAMBRIDGE_YL_SEED.rubric,
      });
      expect(res.status).toBe(400);
    }
  });

  it('AC-14.8 name rỗng hoặc > 200 ký tự ⇒ 400', async () => {
    for (const name of ['', ' ', 'a'.repeat(201)]) {
      const res = await call('POST', '/criteria/templates', {
        key: 'k_ok',
        name,
        rubric: CAMBRIDGE_YL_SEED.rubric,
      });
      expect(res.status).toBe(400);
    }
  });

  it('AC-14.9 rubric không phải object ⇒ 400', async () => {
    for (const rubric of [null, 'x', 42, [], true]) {
      const res = await call('POST', '/criteria/templates', { key: 'k_ok', name: 'n', rubric });
      expect(res.status).toBe(400);
    }
  });

  it('AC-14.3/NFR-S3 isSystem trong body bị whitelist cắt — hàng tạo ra vẫn isSystem=false', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'k_sys',
      name: 'n',
      rubric: CAMBRIDGE_YL_SEED.rubric,
      isSystem: true,
    });
    expect(res.status).toBe(201);
    expect((res.body as { isSystem: boolean }).isSystem).toBe(false);
  });

  it('AC-17.2 isActive phải là boolean THẬT — "true" dạng chuỗi ⇒ 400', async () => {
    expect((await call('PATCH', '/criteria/templates/writing_internal/active', { isActive: 'true' })).status).toBe(400);
    expect((await call('PATCH', '/criteria/templates/writing_internal/active', {})).status).toBe(400);
    expect((await call('PATCH', '/criteria/templates/writing_internal/active', { isActive: 1 })).status).toBe(400);
  });

  it('locked ngoài tập đóng §5.4 ⇒ 400', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'k_lock',
      name: 'n',
      rubric: CAMBRIDGE_YL_SEED.rubric,
      locked: ['scales'],
    });
    expect(res.status).toBe(400);
  });

  it('AC-19.1 rubric có bảng cấp độ hở ⇒ 400 với body {message:"invalid rubric", issues:[…]}', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'k_ho',
      name: 'n',
      rubric: {
        ...CAMBRIDGE_YL_SEED.rubric,
        levels: [
          { min: 0, max: 10, code: 'A0', label: 'a' },
          { min: 20, max: 25, code: 'A2', label: 'b' },
        ],
      },
    });
    expect(res.status).toBe(400);
    const body = res.body as { message: string; issues: Array<{ code: string; message: string }> };
    expect(body.message).toBe('invalid rubric');
    expect(body.issues.map((i) => i.code)).toContain('level_gap');
    expect(body.issues[0].message).toContain('Hở khoảng');
  });

  /**
   * QA fix round 1, DEF-1 — repro NGUYÊN VĂN của QA, qua HTTP thật. Trước bản vá cả ba đều trả
   * 201/200 và âm thầm lưu `step = 1`.
   */
  it.each([[0], [-1]])('DEF-1/AC-19.6 POST với scale.step = %p ⇒ 400, không tạo hàng', async (step) => {
    const res = await call('POST', '/criteria/templates', {
      key: 'k_step',
      name: 'n',
      rubric: { ...CAMBRIDGE_YL_SEED.rubric, scale: { min: 0, max: 5, step } },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('scale.step must be greater than 0');
  });

  it('DEF-1/AC-19.6 PUT với scale.step = 0 ⇒ 400', async () => {
    const res = await call('PUT', '/criteria/templates/writing_internal', {
      rubric: { ...CAMBRIDGE_YL_SEED.rubric, scale: { min: 0, max: 5, step: 0 } },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('scale.step must be greater than 0');
  });

  it('DEF-1 scale.step không phải số ⇒ 400 (normalize không còn nuốt được)', async () => {
    for (const step of [null, 'x']) {
      const res = await call('POST', '/criteria/templates', {
        key: 'k_step2',
        name: 'n',
        rubric: { ...CAMBRIDGE_YL_SEED.rubric, scale: { min: 0, max: 5, step } },
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe('scale.step must be a finite number');
    }
  });

  it('DEF-1 scale.step hợp lệ vẫn được LƯU ĐÚNG giá trị tác giả gõ, không bị ép về 1', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'k_step_ok',
      name: 'n',
      // step 0.5 chia hết span 0..5 ⇒ bảng cấp độ vẫn phủ kín, không sinh level_gap.
      rubric: { ...CAMBRIDGE_YL_SEED.rubric, levels: [], scale: { min: 0, max: 5, step: 0.5 } },
    });
    expect(res.status).toBe(201);
    expect((res.body as { rubric: { scale: { step: number } } }).rubric.scale.step).toBe(0.5);
  });

  it('AC-19.8 rubric thiếu pronunciation ⇒ 400', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'k_khong_pron',
      name: 'n',
      rubric: {
        ...CAMBRIDGE_YL_SEED.rubric,
        levels: [],
        dimensions: [{ key: 'fluency', label: 'Fluency', weight: 1, bands: {}, sub_factors: [] }],
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      'rubric must include the "pronunciation" dimension',
    );
  });

  it('AC-18.3 reset trên mẫu thường ⇒ 409', async () => {
    const res = await call('POST', '/criteria/templates/writing_internal/reset');
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe(
      'reset is only available for system templates',
    );
  });

  it('AC-D.2 xóa mẫu hệ thống ⇒ 409', async () => {
    const res = await call('DELETE', '/criteria/templates/cambridge_yl_a0_a2');
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe('system templates cannot be deleted');
  });

  it('AC-14.6 key trùng ⇒ 409', async () => {
    const res = await call('POST', '/criteria/templates', {
      key: 'writing_internal',
      name: 'n',
      rubric: CAMBRIDGE_YL_SEED.rubric,
    });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toBe('template key already exists');
  });

  it('AC-16.4 PUT với key khác path ⇒ 400 "template key is immutable"', async () => {
    const res = await call('PUT', '/criteria/templates/writing_internal', { key: 'ten_khac' });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('template key is immutable');
  });
});

// ─── F12: hai route mới, kiểm qua HTTP THẬT ────────────────────────────────────────

/** Rubric hợp lệ tối thiểu; KHÔNG chép literal của seed nào (F12 AC-03.5). */
const AUTHORED_RUBRIC = {
  schema_version: 2,
  course_key: 'kid_a1',
  task_type: 'speaking_clip',
  scale: { min: 0, max: 4, step: 1 },
  aggregation: { method: 'sum', round: 'none' },
  levels: [],
  output_fields: ['comment'],
  dimensions: [{ key: 'pronunciation', label: 'Phát âm', weight: 1, bands: { '0': 'Chưa rõ.' } }],
};

describe('F12 FR-01 — POST /criteria/json', () => {
  it('AC-01.1 route tới ĐÚNG handler, KHÔNG rơi vào ParseIntPipe của @Get(":id") ⇒ 201', async () => {
    const res = await call('POST', '/criteria/json', { courseId: 3, rubric: AUTHORED_RUBRIC });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('numeric string is expected');
    expect((res.body as { id: number }).id).toBe(77);
  });

  it('AC-01.4 rubric trả về là bản ĐÃ CHUẨN HÓA (bands chuỗi ⇒ mảng)', async () => {
    const res = await call('POST', '/criteria/json', { courseId: 3, rubric: AUTHORED_RUBRIC });
    const rubric = (res.body as { rubric: { dimensions: Array<{ bands: Record<string, string[]> }> } }).rubric;
    expect(rubric.dimensions[0].bands).toEqual({ '0': ['Chưa rõ.'] });
  });

  it('AC-01.5 `version` trong body bị whitelist cắt — version vẫn do server tính', async () => {
    // Mock `findFirst` trả version 1 ⇒ server phải ghi 2, bất kể client gửi 99.
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: AUTHORED_RUBRIC,
      version: 99,
    });
    expect(res.status).toBe(201);
    expect(prismaMock.criteria.create.mock.calls[0][0].data.version).toBe(2);
  });

  it('AC-01.7 sourceFilename ghi null; AC-01.8 templateKey mồ côi vẫn 201', async () => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: AUTHORED_RUBRIC,
      templateKey: 'mau_khong_ton_tai',
    });
    expect(res.status).toBe(201);
    const data = prismaMock.criteria.create.mock.calls[0][0].data;
    expect(data.sourceFilename).toBeNull();
    expect(data.templateKey).toBe('mau_khong_ton_tai');
  });

  it.each([['Hoa_Thuong'], ['co khoang trang'], ['co-gach'], [''], [42]])(
    'AC-01.8 templateKey %p ⇒ 400 "invalid template key", KHÔNG tạo hàng',
    async (templateKey) => {
      const res = await call('POST', '/criteria/json', {
        courseId: 3,
        rubric: AUTHORED_RUBRIC,
        templateKey,
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe('invalid template key');
      expect(prismaMock.criteria.create).not.toHaveBeenCalled();
    },
  );

  it.each([[0], [-1], ['x'], [null], [1.5]])('AC-01.9 courseId %p ⇒ 400, KHÔNG tạo hàng', async (courseId) => {
    const res = await call('POST', '/criteria/json', { courseId, rubric: AUTHORED_RUBRIC });
    expect(res.status).toBe(400);
    expect(prismaMock.criteria.create).not.toHaveBeenCalled();
  });

  it('AC-01.9 courseId không tồn tại ⇒ 404 "course not found" (KHÔNG phải 500 khóa ngoại)', async () => {
    const res = await call('POST', '/criteria/json', { courseId: 4242, rubric: AUTHORED_RUBRIC });
    expect(res.status).toBe(404);
    expect((res.body as { message: string }).message).toBe('course not found');
    expect(prismaMock.criteria.create).not.toHaveBeenCalled();
  });

  it('AC-01.6 title dài quá 200 ký tự ⇒ 400', async () => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: AUTHORED_RUBRIC,
      title: 'a'.repeat(201),
    });
    expect(res.status).toBe(400);
  });

  /**
   * AC-01.2/AC-01.3 — repro của F10 DEF-1 trên đường ghi MỚI, qua HTTP thật. Nếu ai đó chèn
   * `normalizeRubric` trước `assertAuthorableRubric`, cả bốn ca này trả 201 và tạo một hàng.
   */
  it.each([[0], [-1]])('AC-01.3 scale.step = %p ⇒ 400, KHÔNG tạo hàng', async (step) => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: { ...AUTHORED_RUBRIC, scale: { min: 0, max: 5, step } },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('scale.step must be greater than 0');
    expect(prismaMock.criteria.create).not.toHaveBeenCalled();
  });

  it.each([[null], ['x']])('AC-01.3 scale.step = %p ⇒ 400 "must be a finite number"', async (step) => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: { ...AUTHORED_RUBRIC, scale: { min: 0, max: 5, step } },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('scale.step must be a finite number');
    expect(prismaMock.criteria.create).not.toHaveBeenCalled();
  });

  it('AC-01.3 scale = 42 ⇒ 400 "scale must be an object with numeric min, max and step"', async () => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: { ...AUTHORED_RUBRIC, scale: 42 },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      'scale must be an object with numeric min, max and step',
    );
  });

  it('AC-01.10 rubric vắng mặt ⇒ 400 của cổng rubric (không phải của DTO), không 500', async () => {
    const res = await call('POST', '/criteria/json', { courseId: 3 });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('rubric must declare at least one dimension');
  });

  it.each([[null], [42], ['x'], [[]], [{}]])('AC-01.10 rubric %p ⇒ 400, không 500', async (rubric) => {
    const res = await call('POST', '/criteria/json', { courseId: 3, rubric });
    expect(res.status).toBe(400);
  });

  it('AC-01.10 rubric thiếu pronunciation ⇒ 400 thông điệp miền', async () => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: { ...AUTHORED_RUBRIC, dimensions: [{ key: 'fluency', label: 'F', weight: 1 }] },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      'rubric must include the "pronunciation" dimension',
    );
  });

  it('AC-01.10 bảng cấp độ hở ⇒ 400 body {message:"invalid rubric", issues:[…]}', async () => {
    const res = await call('POST', '/criteria/json', {
      courseId: 3,
      rubric: {
        ...AUTHORED_RUBRIC,
        levels: [
          { min: 0, max: 1, code: 'A', label: 'a' },
          { min: 3, max: 4, code: 'B', label: 'b' },
        ],
      },
    });
    expect(res.status).toBe(400);
    const body = res.body as { message: string; issues: Array<{ code: string }> };
    expect(body.message).toBe('invalid rubric');
    expect(body.issues.map((i) => i.code)).toContain('level_gap');
  });

  it('AC-01.11 ma trận quyền: staff+[] ⇒ 403, staff+rubric_template ⇒ 403, staff+criteria_author ⇒ 201', async () => {
    loginAs(STAFF, { role: 'staff', privileges: [] });
    let res = await call('POST', '/criteria/json', { courseId: 3, rubric: AUTHORED_RUBRIC });
    expect(res.status).toBe(403);
    expect((res.body as { message: string }).message).toBe('insufficient privilege');

    loginAs(STAFF, { role: 'staff', privileges: ['rubric_template'] });
    expect((await call('POST', '/criteria/json', { courseId: 3, rubric: AUTHORED_RUBRIC })).status).toBe(403);

    loginAs(STAFF, { role: 'staff', privileges: ['criteria_author'] });
    res = await call('POST', '/criteria/json', { courseId: 3, rubric: AUTHORED_RUBRIC });
    expect(res.status).toBe(201);
  });

  it('AC-01.11 chưa đăng nhập ⇒ 401', async () => {
    loginAs(undefined, null);
    expect((await call('POST', '/criteria/json', { courseId: 3, rubric: AUTHORED_RUBRIC })).status).toBe(401);
  });
});

describe('F12 FR-02 — POST /criteria/prompt-preview', () => {
  it('AC-02.3 rubric bị TỪ CHỐI lúc lưu vẫn xem trước được (xem trước không phải cổng kiểm)', async () => {
    const broken = { ...AUTHORED_RUBRIC, scale: { min: 0, max: 5, step: 0 }, dimensions: [] };
    expect((await call('POST', '/criteria/json', { courseId: 3, rubric: broken })).status).toBe(400);

    const preview = await call('POST', '/criteria/prompt-preview', { rubric: broken });
    expect(preview.status).toBe(200);
    expect(typeof (preview.body as { prompt: string }).prompt).toBe('string');
  });

  it.each([[null], [[]], ['str'], [42], [{}], [1e308], [{ a: { b: { c: [1] } } }]])(
    'AC-02.4 rubric rác %p ⇒ 200 kèm chuỗi (không 500)',
    async (rubric) => {
      const res = await call('POST', '/criteria/prompt-preview', { rubric });
      expect(res.status).toBe(200);
      expect(typeof (res.body as { prompt: string }).prompt).toBe('string');
    },
  );

  it('AC-02.4 rubric vắng mặt hoàn toàn ⇒ vẫn 200', async () => {
    expect((await call('POST', '/criteria/prompt-preview', {})).status).toBe(200);
  });

  it('AC-02.5 prompt KHÔNG chứa mã/nhãn cấp độ (BR-09)', async () => {
    const res = await call('POST', '/criteria/prompt-preview', {
      rubric: {
        ...AUTHORED_RUBRIC,
        levels: [{ min: 0, max: 4, code: 'MA_CAP_DO', label: 'NHAN_CAP_DO' }],
      },
    });
    expect(res.status).toBe(200);
    const prompt = (res.body as { prompt: string }).prompt;
    expect(prompt).not.toContain('MA_CAP_DO');
    expect(prompt).not.toContain('NHAN_CAP_DO');
  });

  it('AC-02.1 không ghi gì: criteria.create không được gọi lần nào', async () => {
    await call('POST', '/criteria/prompt-preview', { rubric: AUTHORED_RUBRIC });
    expect(prismaMock.criteria.create).not.toHaveBeenCalled();
  });

  it('phân quyền HOẶC: cả hai quyền đều xem trước được; staff+[] ⇒ 403; chưa đăng nhập ⇒ 401', async () => {
    for (const privileges of [['criteria_author'], ['rubric_template'], ['criteria_author', 'rubric_template']]) {
      loginAs(STAFF, { role: 'staff', privileges });
      expect((await call('POST', '/criteria/prompt-preview', { rubric: AUTHORED_RUBRIC })).status).toBe(200);
    }

    loginAs(STAFF, { role: 'staff', privileges: [] });
    expect((await call('POST', '/criteria/prompt-preview', { rubric: AUTHORED_RUBRIC })).status).toBe(403);

    loginAs(undefined, null);
    expect((await call('POST', '/criteria/prompt-preview', { rubric: AUTHORED_RUBRIC })).status).toBe(401);
  });
});
