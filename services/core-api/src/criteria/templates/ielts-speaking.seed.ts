import { deepFreeze, type RubricTemplateSeed } from './seed.types';

/**
 * Mẫu mặc định #2 — IELTS Speaking, nguồn `Criteria-Source/Analystic-ScoringBand.pdf`, bản chép
 * lại có thẩm quyền ở thiết kế `Idea/20260819-ChamDiemRubricV2.md` mục 1.2.
 *
 * Bốn khác biệt CẤU TRÚC so với mẫu Cambridge, tất cả đều được mã hóa ở đây:
 *  1. "điểm từng phần chiếm 25% trong số điểm tổng" ⇒ `method: 'average'`, KHÔNG phải `sum`
 *     (⇒ `maxTotal` = 9, không phải 4 × 9 = 36).
 *  2. "điểm của từng tiêu chí này sẽ KHÔNG CÓ SỐ LẺ như 4.5, 5.5 hay 6.5" ⇒ `round: 'nearest_int'`.
 *  3. Bảng chấm yêu cầu HAI đầu ra mỗi tiêu chí — "Nhận xét" và "Hướng sửa bài" ⇒
 *     `output_fields: ['comment', 'fix']`.
 *  4. `levels: []` — band IELTS KHÔNG phải bậc thang quy đổi; PDF không có bảng chuyển đổi nào.
 *     Mảng rỗng là HỢP LỆ (F9 `validateLevels` trả [] cho nó), nghĩa là "không quy đổi cấp độ".
 *
 * `bands` và `sub_factors` để trống có chủ ý: mô tả từng band (mục 1.2 ý 2 — mỗi band là một danh
 * sách gạch đầu dòng) và lưới từ khóa theo yếu tố con (ý 3) là NỘI DUNG thuộc quyền
 * `criteria_author`, không phải cấu trúc thuộc quyền `rubric_template`. Mẫu chỉ dựng cái khung.
 *
 * BẤT BIẾN: điểm bất động của `normalizeRubric` (AC-06.1) — xem chú thích ở cambridge-yl.seed.ts.
 */
export const IELTS_SPEAKING_SEED: RubricTemplateSeed = deepFreeze({
  key: 'ielts_speaking',
  name: 'IELTS Speaking — Analytic Scoring Band',
  locked: ['dimensions[].key', 'scale', 'aggregation', 'levels', 'output_fields'],
  rubric: {
    schema_version: 2,
    course_key: '',
    task_type: 'speaking_clip',
    tone: 'khích lệ',
    feedback_language: 'vi',
    scale: { min: 0, max: 9, step: 1 },
    aggregation: { method: 'average', round: 'nearest_int' },
    levels: [],
    output_fields: ['comment', 'fix'],
    dimensions: [
      {
        key: 'fluency_coherence',
        label: 'Fluency and coherence',
        weight: 1,
        bands: {},
        sub_factors: [],
      },
      {
        key: 'lexical_resource',
        label: 'Lexical resources',
        weight: 1,
        bands: {},
        sub_factors: [],
      },
      {
        key: 'grammatical_range',
        label: 'Grammatical range and accuracy',
        weight: 1,
        bands: {},
        sub_factors: [],
      },
      {
        // Dimension BẮT BUỘC (kiến trúc mục 3.10). Ở IELTS nó đứng thứ tư đúng như thứ tự PDF —
        // vị trí không quan trọng, SỰ CÓ MẶT mới là điều `assertAuthorableRubric` kiểm.
        key: 'pronunciation',
        label: 'Pronunciation',
        weight: 1,
        bands: {},
        sub_factors: [],
      },
    ],
    comment_bank: [],
    student_reply: null,
  },
});
