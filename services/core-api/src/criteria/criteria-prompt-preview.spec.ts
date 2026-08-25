import { CriteriaController } from './criteria.controller';
import { CriteriaService } from './criteria.service';
import { buildSystemInstruction, buildSystemInstructionText } from './prompt-render';
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

  it('AC-02.1 không chạm database lần nào', () => {
    controller.previewPrompt({ rubric: RUBRIC });
    controller.previewPrompt({ rubric: RUBRIC, variant: 'text' });
    expectNoDatabaseAccess();
  });

  it('AC-02.2 variant vắng mặt ⇒ nhánh audio, và `variant` được vọng lại', () => {
    expect(controller.previewPrompt({ rubric: RUBRIC })).toEqual({
      variant: 'audio',
      prompt: buildSystemInstruction(RUBRIC),
    });
  });

  it('AC-02.2 variant = "audio" | "text" ⇒ đúng hai bộ dựng', () => {
    expect(controller.previewPrompt({ rubric: RUBRIC, variant: 'audio' }).prompt).toBe(
      buildSystemInstruction(RUBRIC),
    );
    expect(controller.previewPrompt({ rubric: RUBRIC, variant: 'text' }).prompt).toBe(
      buildSystemInstructionText(RUBRIC),
    );
    expect(controller.previewPrompt({ rubric: RUBRIC, variant: 'text' }).variant).toBe('text');
  });

  /**
   * AC-02.3 — mỗi rubric dưới đây bị `assertAuthorableRubric` từ chối (test tự khẳng định điều đó,
   * nên nếu luật lưu đổi thì ca này đỏ chứ không âm thầm mất ý nghĩa), nhưng xem trước vẫn 200.
   */
  it.each([
    ['thiếu pronunciation', { dimensions: [{ key: 'fluency', label: 'F', weight: 1 }] }],
    ['scale.step = 0', { scale: { min: 0, max: 5, step: 0 }, dimensions: [{ key: 'pronunciation' }] }],
    ['không có tiêu chí nào', { dimensions: [] }],
    [
      'bảng cấp độ hở',
      {
        dimensions: [{ key: 'pronunciation' }],
        scale: { min: 0, max: 5, step: 1 },
        aggregation: { method: 'sum', round: 'none' },
        levels: [
          { min: 0, max: 1, code: 'A', label: 'a' },
          { min: 3, max: 5, code: 'B', label: 'b' },
        ],
      },
    ],
  ])('AC-02.3 rubric "%s" bị từ chối lúc LƯU nhưng vẫn xem trước được', (_name, rubric) => {
    expect(() => assertAuthorableRubric(rubric)).toThrow();
    const result = controller.previewPrompt({ rubric });
    expect(typeof result.prompt).toBe('string');
    expect(result.prompt.length).toBeGreaterThan(0);
    expectNoDatabaseAccess();
  });

  it.each([[null], [undefined], [[]], ['str'], [42], [{}], [1e308], [{ a: { b: { c: [1, 2] } } }]])(
    'AC-02.4 rubric rác %p ⇒ vẫn ra chuỗi, không ném',
    (rubric) => {
      expect(typeof controller.previewPrompt({ rubric }).prompt).toBe('string');
      expect(typeof controller.previewPrompt({ rubric, variant: 'text' }).prompt).toBe('string');
    },
  );

  it('AC-02.6 trả về đúng hai khóa, `prompt` là chuỗi có ký tự xuống dòng THẬT', () => {
    const result = controller.previewPrompt({ rubric: RUBRIC });
    expect(Object.keys(result).sort()).toEqual(['prompt', 'variant']);
    expect(result.prompt).toContain('\n');
    expect(result.prompt).not.toContain('\\n'); // không escape sẵn kiểu HTML/JSON hai lần
  });
});
