import type { EventsService } from '../events/events.service';
import { WorkerApiController } from '../worker-api/worker-api.controller';
import { CriteriaService } from './criteria.service';
import { parseRubricFromDocxBuffer } from './docx-parser';
import { RubricTemplateService } from './rubric-template.service';
import { CAMBRIDGE_YL_SEED } from './templates';

jest.mock('./docx-parser', () => ({ parseRubricFromDocxBuffer: jest.fn() }));

/**
 * F10 AC-02.4 — BÀI TEST QUAN TRỌNG NHẤT CỦA TÍNH NĂNG NÀY (thiết kế mục 10 ý 3).
 *
 * Khẳng định: `criteria.template_key` là MỘT CHUỖI THƯỜNG, không phải khóa ngoại. Vì vậy xóa một
 * `rubric_templates` để lại một `templateKey` MỒ CÔI — và mọi đường dùng `criteria` phải tiếp tục
 * chạy y như trước: đọc chi tiết, liệt kê, API nội bộ cho worker, và ĐẶC BIỆT là chấm bài
 * (`POST /internal/gradings` vẫn tính và ghi được tổng điểm).
 *
 * Nếu ai đó "sửa cho chuẩn" bằng cách thêm một `@relation` + `ON DELETE RESTRICT`, file này sẽ đỏ
 * — hoặc tệ hơn, sẽ không đỏ ở đây mà đỏ ngoài production khi giáo viên bấm nút xóa mẫu.
 */

interface CriteriaRow {
  id: number;
  courseId: number;
  title: string;
  rubric: unknown;
  sourceFilename: string | null;
  version: number;
  templateKey: string | null;
  createdAt: Date;
}

interface TemplateRow {
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

/**
 * Một "cơ sở dữ liệu" trong bộ nhớ chứa CẢ HAI bảng, dùng chung cho ba service — đúng cái mà
 * một khóa ngoại (nếu có) sẽ ràng buộc. Ở đây KHÔNG có ràng buộc nào, và đó là điều đang được
 * chứng minh.
 */
function makeWorld() {
  const criteriaRows: CriteriaRow[] = [
    {
      id: 7,
      courseId: 3,
      title: 'KID — speaking_clip',
      rubric: JSON.parse(JSON.stringify(CAMBRIDGE_YL_SEED.rubric)) as unknown,
      sourceFilename: 'kid.docx',
      version: 2,
      templateKey: 'x',
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    },
  ];
  const templateRows: TemplateRow[] = [
    {
      id: 1,
      key: 'x',
      name: 'Mẫu x',
      rubric: JSON.parse(JSON.stringify(CAMBRIDGE_YL_SEED.rubric)) as unknown,
      locked: [],
      isSystem: false,
      isActive: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  ];
  const gradings: Array<Record<string, unknown>> = [];

  const prisma = {
    criteria: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => {
        const row = criteriaRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: { courseId: number } }) =>
        criteriaRows.filter((r) => r.courseId === where.courseId).map((r) => ({ ...r })),
      ),
      findFirst: jest.fn(async ({ where }: { where: { courseId: number } }) => {
        const row = criteriaRows.filter((r) => r.courseId === where.courseId).at(-1);
        return row ? { ...row } : null;
      }),
    },
    rubricTemplate: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
        const row = templateRows.find((r) => r.key === where.key);
        return row ? { ...row } : null;
      }),
      delete: jest.fn(async ({ where }: { where: { key: string } }) => {
        const index = templateRows.findIndex((r) => r.key === where.key);
        if (index < 0) throw { code: 'P2025' };
        const [removed] = templateRows.splice(index, 1);
        return { ...removed };
      }),
    },
    submission: {
      findUnique: jest.fn(async () => ({
        id: 55,
        studentId: 9,
        receivedAt: new Date('2026-08-12T03:00:00.000Z'),
      })),
    },
    grading: {
      create: jest.fn((args: { data: Record<string, unknown> }) => args),
    },
    student: { updateMany: jest.fn((args: unknown) => args) },
    $transaction: jest.fn(async (ops: Array<{ data?: Record<string, unknown> }>) => {
      const grading = { id: gradings.length + 1, ...(ops[0].data ?? {}) };
      gradings.push(grading);
      return ops.map((op, i) => (i === 0 ? grading : op));
    }),
  };

  return { prisma, criteriaRows, templateRows, gradings };
}

const KID_SCORES = {
  pronunciation: { score: 4 },
  intonation: { score: 3 },
  ending_sounds: { score: 4 },
  word_stress: { score: 3 },
  fluency: { score: 4 },
};

describe('AC-02.4 — xóa mẫu KHÔNG phá các `criteria` đã soạn ra từ nó', () => {
  it('mốc trước khi xóa: criteria đọc được và chấm ra 18/25 ~ A1', async () => {
    const { prisma } = makeWorld();
    const criteria = new CriteriaService(prisma as never);
    const worker = new WorkerApiController(prisma as never, { emit: jest.fn() } as unknown as EventsService);

    await expect(criteria.get(7)).resolves.toMatchObject({ id: 7, templateKey: 'x' });
    const grading = await worker.createGrading({
      submissionId: 55,
      criteriaId: 7,
      criteriaVersion: 2,
      scores: KID_SCORES,
      llmFeedback: 'ok',
    } as never);
    expect(grading).toMatchObject({ totalScore: 18, levelCode: 'A1', levelLabel: 'Mover (A1) ~ Junior Panda' });
  });

  it('xóa mẫu ⇒ 204 (không throw) và bảng criteria KHÔNG bị đụng một byte nào', async () => {
    const { prisma, criteriaRows, templateRows } = makeWorld();
    const before = JSON.stringify(criteriaRows);

    await expect(new RubricTemplateService(prisma as never).remove('x')).resolves.toBeUndefined();

    expect(templateRows).toHaveLength(0);
    expect(JSON.stringify(criteriaRows)).toBe(before);
    expect(criteriaRows[0].templateKey).toBe('x'); // giá trị MỒ CÔI — trạng thái bình thường
  });

  it('sau khi xóa: GET /criteria/:id vẫn 200, rubric không đổi, templateKey vẫn là "x"', async () => {
    const { prisma } = makeWorld();
    await new RubricTemplateService(prisma as never).remove('x');

    const criteria = new CriteriaService(prisma as never);
    const row = await criteria.get(7);
    expect(row.id).toBe(7);
    expect((row as unknown as { templateKey: string | null }).templateKey).toBe('x');
    expect(row.rubric).toEqual(CAMBRIDGE_YL_SEED.rubric);
  });

  it('sau khi xóa: GET /criteria?courseId= vẫn liệt kê nó', async () => {
    const { prisma } = makeWorld();
    await new RubricTemplateService(prisma as never).remove('x');
    const list = await new CriteriaService(prisma as never).list(3);
    expect(list.map((r) => r.id)).toEqual([7]);
    expect((list[0] as unknown as { templateKey: string | null }).templateKey).toBe('x');
  });

  it('sau khi xóa: GET /internal/criteria/:courseId vẫn trả hàng NGUYÊN TRẠNG (không normalize)', async () => {
    const { prisma } = makeWorld();
    await new RubricTemplateService(prisma as never).remove('x');
    const worker = new WorkerApiController(prisma as never, { emit: jest.fn() } as unknown as EventsService);
    const row = await worker.criteria(3);
    expect(row.id).toBe(7);
    expect((row as unknown as { templateKey: string | null }).templateKey).toBe('x');
  });

  it('sau khi xóa: POST /internal/gradings VẪN CHẤM ĐƯỢC và ghi đúng 18/25 ~ A1', async () => {
    const { prisma, gradings } = makeWorld();
    await new RubricTemplateService(prisma as never).remove('x');

    const worker = new WorkerApiController(prisma as never, { emit: jest.fn() } as unknown as EventsService);
    const grading = await worker.createGrading({
      submissionId: 55,
      criteriaId: 7,
      criteriaVersion: 2,
      scores: KID_SCORES,
      llmFeedback: 'ok',
    } as never);

    expect(grading).toMatchObject({
      criteriaId: 7,
      totalScore: 18,
      levelCode: 'A1',
      levelLabel: 'Mover (A1) ~ Junior Panda',
    });
    expect(gradings).toHaveLength(1);
  });

  it('không có đường nào trả 409/500 vì một templateKey mồ côi', async () => {
    const { prisma } = makeWorld();
    await new RubricTemplateService(prisma as never).remove('x');

    const criteria = new CriteriaService(prisma as never);
    const worker = new WorkerApiController(prisma as never, { emit: jest.fn() } as unknown as EventsService);

    await expect(criteria.get(7)).resolves.toBeDefined();
    await expect(criteria.list(3)).resolves.toHaveLength(1);
    await expect(worker.criteria(3)).resolves.toBeDefined();
    await expect(
      worker.createGrading({
        submissionId: 55,
        criteriaId: 7,
        criteriaVersion: 2,
        scores: KID_SCORES,
        llmFeedback: 'ok',
      } as never),
    ).resolves.toBeDefined();
  });
});

describe('AC-02.5 / AC-02.6 — templateKey trên đường đọc criteria', () => {
  it('AC-02.5 GET /criteria và GET /criteria/:id đều mang templateKey (null cho hàng cũ)', async () => {
    const { prisma, criteriaRows } = makeWorld();
    criteriaRows.push({ ...criteriaRows[0], id: 8, templateKey: null, version: 3 });
    const service = new CriteriaService(prisma as never);

    const list = await service.list(3);
    expect(list.map((r) => (r as unknown as { templateKey: string | null }).templateKey)).toEqual([
      'x',
      null,
    ]);
    await expect(service.get(8)).resolves.toMatchObject({ templateKey: null });
  });

  it('AC-02.6 đường upload .docx của F10 KHÔNG BAO GIỜ ghi templateKey', async () => {
    // Parser thật cần một .docx hợp lệ; ở đây chỉ quan tâm ĐƯỜNG GHI, nên thay parser bằng mock
    // và soi đúng đối số truyền cho `prisma.criteria.create`.
    (parseRubricFromDocxBuffer as jest.Mock).mockResolvedValue({
      ...CAMBRIDGE_YL_SEED.rubric,
      course_key: 'KID',
    });
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 99, ...data }));
    const prisma = { criteria: { findFirst: jest.fn(async () => ({ version: 4 })), create } };

    await new CriteriaService(prisma as never).ingestDocx(3, Buffer.from(''), 'kid.docx');

    expect(create).toHaveBeenCalledTimes(1);
    const data = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual([
      'courseId',
      'rubric',
      'sourceFilename',
      'title',
      'version',
    ]);
    expect(data).not.toHaveProperty('templateKey');
  });
});
