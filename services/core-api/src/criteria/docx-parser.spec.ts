import { parseRubricFromHtml } from './docx-parser';
import { normalizeRubric } from './rubric-schema';

const VALID_HTML = `
<h1>Thông tin chung</h1>
<p>Khóa: basic</p>
<p>Loại bài: speaking_clip</p>
<p>Thang điểm: 0-3</p>
<h1>Tiêu chí</h1>
<p>fluency (trọng số 0.25): 0=Nói rời rạc; 3=Nói trôi chảy tự nhiên</p>
<p>vocabulary (trọng số 0.25): 0=Từ vựng nghèo nàn; 3=Từ vựng phong phú</p>
<p>pronunciation (trọng số 0.5): 0=Khó nghe; 3=Phát âm chuẩn</p>
<h1>Giọng điệu &amp; ngôn ngữ nhận xét</h1>
<p>Giọng điệu: khích lệ</p>
<p>Ngôn ngữ nhận xét: vi</p>
<h1>Ví dụ nhận xét mẫu</h1>
<p>Em nói khá trôi chảy, cần chú ý phát âm âm cuối.</p>
<p>Bài làm tốt, từ vựng phong phú.</p>
`;

describe('parseRubricFromHtml', () => {
  it('parses course_key, task_type, and scale from "Thông tin chung"', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.course_key).toBe('basic');
    expect(rubric.task_type).toBe('speaking_clip');
    expect(rubric.scale).toEqual({ min: 0, max: 3, step: 1 });
  });

  it('parses tone and feedback_language from "Giọng điệu & ngôn ngữ nhận xét"', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.tone).toBe('khích lệ');
    expect(rubric.feedback_language).toBe('vi');
  });

  it('parses every dimension with its weight and bulleted bands', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.dimensions).toHaveLength(3);
    const fluency = rubric.dimensions.find((d) => d.key === 'fluency');
    expect(fluency?.weight).toBe(0.25);
    expect(fluency?.label).toBe('fluency');
    expect(fluency?.bands).toEqual({ '0': ['Nói rời rạc'], '3': ['Nói trôi chảy tự nhiên'] });
    expect(fluency?.sub_factors).toEqual([]);
  });

  it('parses sample comments into the comment bank, one per paragraph', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.comment_bank).toEqual([
      { dimension: null, intent: null, text: 'Em nói khá trôi chảy, cần chú ý phát âm âm cuối.' },
      { dimension: null, intent: null, text: 'Bài làm tốt, từ vựng phong phú.' },
    ]);
  });

  // ---- F8: đầu ra là rubric v2 ----

  it('emits schema_version 2 and no v1 keys anywhere', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.schema_version).toBe(2);
    const asJson = JSON.stringify(rubric);
    expect(asJson).not.toContain('band_scale');
    expect(asJson).not.toContain('few_shot_examples');
    expect(asJson).not.toContain('"name"');
  });

  it('defaults aggregation/levels/output_fields/student_reply for a docx-imported rubric', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.aggregation).toEqual({ method: 'average', round: 'none' });
    expect(rubric.levels).toEqual([]);
    expect(rubric.output_fields).toEqual(['comment']);
    expect(rubric.student_reply).toBeNull();
  });

  it('lowercases the machine key but keeps the label as written in the document', () => {
    const html = VALID_HTML.replace(
      '<p>pronunciation (trọng số 0.5): 0=Khó nghe; 3=Phát âm chuẩn</p>',
      '<p>Pronunciation (trọng số 0.5): 0=Khó nghe; 3=Chuẩn</p>',
    );
    const dimension = parseRubricFromHtml(html).dimensions.find((d) => d.key === 'pronunciation');
    expect(dimension?.key).toBe('pronunciation');
    expect(dimension?.label).toBe('Pronunciation');
  });

  it('produces output that is already a normalizeRubric fixed point', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(normalizeRubric(rubric)).toEqual(rubric);
  });

  it('keeps title fields (course_key/task_type) resolvable for criteria.service', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(`${rubric.course_key} — ${rubric.task_type}`).toBe('basic — speaking_clip');
  });

  // ---- Cổng chặn: KHÔNG ĐỔI ở F8 ----

  it('rejects a rubric missing the mandatory pronunciation dimension', () => {
    const withoutPronunciation = VALID_HTML.replace(/<p>pronunciation.*?<\/p>\n/, '');
    expect(() => parseRubricFromHtml(withoutPronunciation)).toThrow(/pronunciation/);
  });

  it('rejects a file missing the required headings entirely', () => {
    expect(() => parseRubricFromHtml('<p>Không có heading nào cả</p>')).toThrow(/template chuẩn/);
  });
});
