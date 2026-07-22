import { parseRubricFromHtml } from './docx-parser';

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
  it('parses course_key, task_type, and band_scale from "Thông tin chung"', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.course_key).toBe('basic');
    expect(rubric.task_type).toBe('speaking_clip');
    expect(rubric.band_scale).toEqual([0, 3]);
  });

  it('parses tone and feedback_language from "Giọng điệu & ngôn ngữ nhận xét"', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.tone).toBe('khích lệ');
    expect(rubric.feedback_language).toBe('vi');
  });

  it('parses every dimension with its weight and bands', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.dimensions).toHaveLength(3);
    const fluency = rubric.dimensions.find((d) => d.name === 'fluency');
    expect(fluency?.weight).toBe(0.25);
    expect(fluency?.bands).toEqual({ '0': 'Nói rời rạc', '3': 'Nói trôi chảy tự nhiên' });
  });

  it('parses few-shot examples, one per paragraph', () => {
    const rubric = parseRubricFromHtml(VALID_HTML);
    expect(rubric.few_shot_examples).toEqual([
      'Em nói khá trôi chảy, cần chú ý phát âm âm cuối.',
      'Bài làm tốt, từ vựng phong phú.',
    ]);
  });

  it('rejects a rubric missing the mandatory pronunciation dimension', () => {
    const withoutPronunciation = VALID_HTML.replace(/<p>pronunciation.*?<\/p>\n/, '');
    expect(() => parseRubricFromHtml(withoutPronunciation)).toThrow(/pronunciation/);
  });

  it('rejects a file missing the required headings entirely', () => {
    expect(() => parseRubricFromHtml('<p>Không có heading nào cả</p>')).toThrow(/template chuẩn/);
  });
});
