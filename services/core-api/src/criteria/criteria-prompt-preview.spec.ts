import { CriteriaController } from './criteria.controller';
import { CriteriaService } from './criteria.service';
import { buildSystemInstruction } from './prompt-render';
import { assertAuthorableRubric } from './rubric-validation';

/**
 * F12 FR-02 — `POST /criteria/prompt-preview` ở mức HANDLER (không HTTP, không guard), để khẳng
 * định đúng hai điều mà một test qua HTTP khó nói rõ:
 *   1. AC-02.1 — handler KHÔNG chạm database: mock Prisma nhận ĐÚNG 0 lời gọi. Ở tầng này không có
 *      `PrivilegeGuard` (guard mới là bên đọc `dashboard_users`), nên "0 lời gọi" là 0 thật.
 *   2. AC-02.3 — xem trước là DỄ DÃI: `assertAuthorableRubric` KHÔNG được gọi. Chứng minh bằng dữ
 *      liệu: mọi rubric dưới đây đều bị chính hàm đó từ chối, nhưng vẫn phải ra 200 + chuỗi.
 */

/** Mọi phương thức Prisma mà bất kỳ đường nào của controller này có thể gọi tới. Có mặt đầy đủ thì
 * `not.toHaveBeenCalled()` mới là khẳng định về CONTROLLER chứ không phải về hình dạng mock. */
const PRISMA_METHODS = [
  'findMany',
  'findUnique',
  'findFirst',
  'create',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
] as const;

function makePrismaMock(): Record<string, Record<string, jest.Mock>> {
  const model = (): Record<string, jest.Mock> =>
    Object.fromEntries(PRISMA_METHODS.map((m) => [m, jest.fn()]));
  return { criteria: model(), course: model(), rubricTemplate: model(), dashboardUser: model() };
}

describe('CriteriaController.previewPrompt (F12 FR-02)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let controller: CriteriaController;

  beforeEach(() => {
    prisma = makePrismaMock();
    controller = new CriteriaController(new CriteriaService(prisma as never), {} as never);
  });

  const expectNoDatabaseAccess = (): void => {
    for (const [model, methods] of Object.entries(prisma)) {
      for (const [name, fn] of Object.entries(methods)) {
        expect([model, name, fn.mock.calls.length]).toEqual([model, name, 0]);
      }
    }
  };

  const RUBRIC = {
    schema_version: 2,
    course_key: 'kid_a1',
    output_fields: ['comment'],
    dimensions: [{ key: 'pronunciation', label: 'Phát âm', weight: 1, bands: { '0': ['Chưa rõ.'] } }],
  };

  // AC-02.1 — handler không chạm DB. Mock có ĐỦ mọi phương thức nên "0 lời gọi" là khẳng định về
  // controller, không phải về hình dạng mock.
  it('không đọc/ghi database', () => {
    controller.previewPrompt({ rubric: RUBRIC } as never);
    expectNoDatabaseAccess();
  });

  // AC-02.3 — xem trước DỄ DÃI: rubric dưới đây bị `assertAuthorableRubric` từ chối (thiếu
  // `scale`/`levels` hợp lệ, `dimensions` rỗng...) nhưng vẫn phải ra chuỗi prompt, vì đây là ô
  // xem trước chứ không phải cổng lưu.
  it.each([
    ['dimensions rỗng', { schema_version: 2, dimensions: [] }],
    ['thiếu pronunciation', { schema_version: 2, dimensions: [{ key: 'fluency' }] }],
    ['scale.max = 0', { ...RUBRIC, scale: { min: 0, max: 0, step: 1 } }],
    ['rác hoàn toàn', {}],
    ['null', null],
  ])('vẫn xem trước được dù rubric %s bị cổng lưu từ chối', (_label, rubric) => {
    expect(() => assertAuthorableRubric(rubric)).toThrow();

    const res = controller.previewPrompt({ rubric } as never);

    expect(typeof res.prompt).toBe('string');
    expectNoDatabaseAccess();
  });

  // Chỉ còn MỘT nhánh sau khi gỡ chấm-từ-transcript (2026-08-25): phản hồi là `{ prompt }` và
  // phải khớp CHÍNH XÁC renderer, không có lắp ghép riêng ở tầng controller.
  it('trả đúng { prompt } và khớp renderer', () => {
    const res = controller.previewPrompt({ rubric: RUBRIC } as never);

    expect(Object.keys(res)).toEqual(['prompt']);
    expect(res.prompt).toBe(buildSystemInstruction(RUBRIC));
  });
});
