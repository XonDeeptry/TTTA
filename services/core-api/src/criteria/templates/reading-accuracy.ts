/**
 * Tiêu chí "Content (Đọc đủ & đúng chữ)" cho bài ĐỌC TO của thiếu nhi (chủ dự án duyệt 2026-10-03).
 *
 * Vì sao: chuẩn chấm bài đọc to (PTE Read Aloud) có 3 trục — Content (không bỏ / thêm / thay từ),
 * Oral fluency, Pronunciation. Rubric thiếu nhi có đủ phát âm + trôi chảy nhưng KHÔNG có Content: một em
 * bỏ cả câu vẫn có thể được điểm cao.
 *
 * `in_total: false` = tiêu chí THÔNG TIN (`computeTotal`): có điểm + nhận xét gửi học viên nhưng KHÔNG
 * vào tổng 25, max hay cấp độ — ngưỡng A0/A1-/A1… của học thuật giữ nguyên. Khi học thuật đặt lại
 * ngưỡng cho tổng 30 thì bỏ cờ này (về `true`).
 *
 * Đo bằng Azure (CompletenessScore so với bài đọc của lớp — tất định). Lớp CHƯA nhập bài đọc thì không
 * có gì để so ⇒ worker BỎ tiêu chí này khỏi lượt chấm, không để AI đoán điểm.
 */
import type { RubricDimensionV2 } from '../rubric-schema';

export const READING_ACCURACY_KEY = 'reading_accuracy';

export const READING_ACCURACY_DIMENSION: RubricDimensionV2 = {
  key: READING_ACCURACY_KEY,
  criterion_key: null,
  label: 'Content (Đọc đủ & đúng chữ)',
  weight: 1,
  bands: {
    '0': ['Không đọc theo bài đọc của lớp.'],
    '1': ['Chỉ đọc được một phần nhỏ của bài; bỏ phần lớn nội dung.'],
    '2': ['Bỏ nhiều từ hoặc cả cụm; đọc thêm hoặc thay từ khiến một số câu sai nghĩa.'],
    '3': ['Bỏ, thêm hoặc thay một số từ, nhưng vẫn theo được nội dung chính của bài.'],
    '4': ['Đọc gần như đủ; bỏ, thêm hoặc thay 1–2 từ nhỏ, không ảnh hưởng nghĩa.'],
    '5': ['Đọc đủ toàn bộ bài, không bỏ, thêm hay thay từ nào.'],
  },
  sub_factors: [],
  in_total: false,
};
