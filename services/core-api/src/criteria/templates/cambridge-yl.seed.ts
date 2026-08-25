import { deepFreeze, type RubricTemplateSeed } from './seed.types';

/**
 * Mẫu mặc định #1 — Cambridge Young Learners (A0–A2), nguồn `Criteria-Source/RubricSpeakingA0-C.pdf`,
 * bản chép lại có thẩm quyền nằm ở thiết kế `Idea/20260819-ChamDiemRubricV2.md` mục 1.1.
 *
 * Bảng A của PDF (phần dùng để chấm máy): 5 tiêu chí × thang 0–5 ⇒ **tổng tối đa 25 điểm**, rồi
 * quy đổi ra 4 cấp độ. Vì vậy `aggregation.method = 'sum'` (KHÔNG phải average) và `levels` phủ
 * kín 0..25 không hở, không chồng lấn.
 *
 * Bảng B (hồ sơ mô tả theo cấp độ) và Bảng C (ngân hàng nhận xét "CMT LỚP KIDS-TEEN") là NỘI DUNG
 * do `criteria_author` soạn, không phải cấu trúc — mẫu chỉ chở sẵn Band 0 và Band 5 nguyên văn của
 * Bảng A làm mỏ neo; band 1–4 và `comment_bank` cố ý để trống (thiết kế mục 4: "một rubric v2 với
 * phần mô tả band để trống hoặc điền sẵn").
 *
 * BẤT BIẾN: đối tượng này phải là ĐIỂM BẤT ĐỘNG của `normalizeRubric` — `normalizeRubric(rubric)`
 * deep-equal chính nó (F8 AC-15.9 / F10 AC-06.1). Có test riêng cho từng seed; nếu bạn thêm khóa
 * lạ ở top-level hoặc để khoảng trắng thừa trong một band, test đó sẽ đỏ.
 */
export const CAMBRIDGE_YL_SEED: RubricTemplateSeed = deepFreeze({
  key: 'cambridge_yl_a0_a2',
  name: 'Cambridge Young Learners (A0–A2) — Speaking',
  locked: ['dimensions[].key', 'scale', 'aggregation', 'levels', 'output_fields'],
  rubric: {
    schema_version: 2,
    // Rỗng: mẫu KHÔNG gắn với một khóa cụ thể nào. Giá trị thật được điền lúc soạn `criteria`.
    course_key: '',
    task_type: 'speaking_clip',
    tone: 'khích lệ',
    feedback_language: 'vi',
    scale: { min: 0, max: 5, step: 1 },
    aggregation: { method: 'sum', round: 'none' },
    levels: [
      { min: 0, max: 10, code: 'A0', label: 'Pre-starter (A0) ~ Tiny Rabbit' },
      { min: 11, max: 15, code: 'A1-', label: 'Starter (A1-) ~ Little Fox' },
      { min: 16, max: 20, code: 'A1', label: 'Mover (A1) ~ Junior Panda' },
      { min: 21, max: 25, code: 'A2', label: 'Flyer (A2) ~ Great Big Dino' },
    ],
    output_fields: ['comment'],
    dimensions: [
      {
        // Dimension BẮT BUỘC (kiến trúc mục 3.10) — luôn đứng đầu danh sách.
        key: 'pronunciation',
        label: 'Pronunciation (Âm chính)',
        weight: 1,
        bands: {
          '0': ['Không phát âm được, khó hiểu.'],
          '5': ['Phát âm rõ ràng, dễ hiểu, gần chuẩn người bản ngữ.'],
        },
        sub_factors: [],
      },
      {
        key: 'intonation',
        label: 'Intonation (Ngữ điệu)',
        weight: 1,
        bands: {
          '0': ['Không có ngữ điệu, đều giọng.'],
          '5': ['Ngữ điệu tự nhiên, biểu cảm tốt, hỗ trợ truyền đạt ý nghĩa.'],
        },
        sub_factors: [],
      },
      {
        key: 'ending_sounds',
        label: 'Ending sounds (Âm đuôi)',
        weight: 1,
        bands: {
          '0': ['Luôn bỏ âm cuối.'],
          '5': ['Phát âm hầu hết âm cuối chuẩn xác, rõ ràng.'],
        },
        sub_factors: [],
      },
      {
        key: 'word_stress',
        label: 'Word Stress (Trọng âm từ/cụm)',
        weight: 1,
        bands: {
          '0': ['Không có trọng âm, đọc đều từng âm tiết.'],
          '5': ['Trọng âm chuẩn xác, tự nhiên cả ở từ và cụm.'],
        },
        sub_factors: [],
      },
      {
        key: 'fluency',
        label: 'Fluency (Trôi chảy)',
        weight: 1,
        bands: {
          '0': ['Không nói được / im lặng.'],
          '5': ['Nói mượt mà, tự nhiên, có thể diễn đạt ý phức đơn giản.'],
        },
        sub_factors: [],
      },
    ],
    comment_bank: [],
    student_reply: null,
  },
});
