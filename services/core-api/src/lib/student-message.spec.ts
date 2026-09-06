import { formatTimestamp, renderStudentMessage } from './student-message';

const SCORES = {
  fluency: { score: 3, comment: 'ổn', fix: 'Dùng từ nối "Well..." để giữ nhịp.' },
  pronunciation: {
    score: 3,
    comment: 'khá rõ',
    fix: 'Tra IPA trước khi nói.',
    mispronounced_words: [
      { word: 'genres', heard_as: 'vee-jurns', suggestion: '/ˈʒɑːnrəz/', approx_position_sec: 43 },
      { word: 'instruments', heard_as: 'in-STRU-ments', suggestion: '/ˈɪnstrəmənts/', approx_position_sec: 165 },
    ],
  },
};

const BASE = { feedback: 'Em làm tốt lắm!', scores: SCORES, totalScore: 15, totalMax: 25, levelLabel: 'Starter (A1-)' };

describe('renderStudentMessage', () => {
  // ─── tương thích ngược: đây là bất biến quan trọng nhất của file này ───────────────

  it('rubric KHÔNG có student_reply ⇒ trả nguyên văn feedback, từng byte', () => {
    expect(renderStudentMessage({ dimensions: [] }, BASE)).toBe('Em làm tốt lắm!');
  });

  it('rubric null/hỏng ⇒ vẫn trả feedback, không ném lỗi', () => {
    expect(renderStudentMessage(null, BASE)).toBe('Em làm tốt lắm!');
    expect(renderStudentMessage('không phải object', BASE)).toBe('Em làm tốt lắm!');
  });

  it('student_reply rỗng (không template, không công tắc) ⇒ vẫn chỉ feedback', () => {
    expect(renderStudentMessage({ student_reply: {} }, BASE)).toBe('Em làm tốt lắm!');
  });

  // ─── công tắc có sẵn từ F11 ────────────────────────────────────────────────────────

  it('show_total / show_level bật ⇒ nối thêm dòng tổng điểm và cấp độ', () => {
    const out = renderStudentMessage({ student_reply: { show_total: true, show_level: true } }, BASE);
    expect(out).toContain('Tổng điểm: 15/25');
    expect(out).toContain('Cấp độ: Starter (A1-)');
  });

  it('show_total bật nhưng thiếu điểm ⇒ bỏ qua dòng đó thay vì in "null/null"', () => {
    const out = renderStudentMessage(
      { student_reply: { show_total: true } },
      { ...BASE, totalScore: null, totalMax: null },
    );
    expect(out).toBe('Em làm tốt lắm!');
  });

  // ─── template: lý do tính năng này tồn tại ─────────────────────────────────────────

  it('{{pronunciation_errors}} liệt kê từ + nghe thành + gợi ý + mốc mm:ss', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{feedback}}\n\nCần luyện:\n{{pronunciation_errors}}' } },
      BASE,
    );
    expect(out).toContain('• 0:43 — "genres" em đọc thành "vee-jurns" → /ˈʒɑːnrəz/');
    expect(out).toContain('• 2:45 — "instruments" em đọc thành "in-STRU-ments" → /ˈɪnstrəmənts/');
  });

  it('{{fixes}} gom hướng sửa của mọi tiêu chí', () => {
    const out = renderStudentMessage({ student_reply: { template: '{{fixes}}' } }, BASE);
    expect(out).toContain('Dùng từ nối "Well..." để giữ nhịp.');
    expect(out).toContain('Tra IPA trước khi nói.');
  });

  it('{{total}} và {{level}} thay đúng giá trị', () => {
    expect(renderStudentMessage({ student_reply: { template: '{{total}} | {{level}}' } }, BASE)).toBe(
      '15/25 | Starter (A1-)',
    );
  });

  it('placeholder không biết được GIỮ NGUYÊN, không biến thành rỗng', () => {
    expect(renderStudentMessage({ student_reply: { template: 'x {{khong_ton_tai}} y' } }, BASE)).toBe(
      'x {{khong_ton_tai}} y',
    );
  });

  /**
   * Nhận xét là văn LLM sinh ra. Nếu thay thế chạy nhiều lượt, một nhận xét chứa `{{total}}`
   * sẽ được thay thật — tức là LLM điều khiển được cấu trúc tin gửi học viên.
   */
  it('KHÔNG thay placeholder nằm trong nội dung vừa chèn (thay đúng MỘT lượt)', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{feedback}}' } },
      { ...BASE, feedback: 'Em được {{total}} nhé' },
    );
    expect(out).toBe('Em được {{total}} nhé');
  });

  // ─── dữ liệu thiếu/hỏng: không được làm vỡ đường gửi ───────────────────────────────

  it('không có từ phát âm sai ⇒ placeholder rỗng, không để lại dòng trống thừa', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{feedback}}\n\n{{pronunciation_errors}}' } },
      { ...BASE, scores: { fluency: { score: 3, comment: 'ổn' } } },
    );
    expect(out).toBe('Em làm tốt lắm!');
  });

  it('mục thiếu tên từ bị bỏ qua; thiếu mốc giây thì bỏ mốc chứ không bỏ cả dòng', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{pronunciation_errors}}' } },
      {
        ...BASE,
        scores: {
          pronunciation: {
            score: 2,
            comment: '',
            mispronounced_words: [
              { heard_as: 'không có tên từ' },
              { word: 'work', suggestion: '/wɜːk/' },
            ],
          },
        },
      },
    );
    expect(out).toBe('• "work" → /wɜːk/');
  });

  // ─── nhãn treo lơ lửng khi khối rỗng ──────────────────────────────────────────────

  it('khối rỗng ⇒ XÓA luôn dòng nhãn đứng trước, không để nhãn treo', () => {
    const template = '{{feedback}}\n\nEm chú ý mấy từ này nhé:\n{{pronunciation_errors}}';
    const out = renderStudentMessage(
      { student_reply: { template } },
      { ...BASE, scores: { fluency: { score: 3, comment: 'ổn' } } },
    );
    expect(out).toBe('Em làm tốt lắm!');
    expect(out).not.toContain('Em chú ý');
  });

  it('khối CÓ nội dung ⇒ giữ nguyên nhãn', () => {
    const template = 'Em chú ý mấy từ này nhé:\n{{pronunciation_errors}}';
    const out = renderStudentMessage({ student_reply: { template } }, BASE);
    expect(out).toContain('Em chú ý mấy từ này nhé:');
    expect(out).toContain('"genres"');
  });

  it('dòng trước không phải nhãn (không kết thúc bằng ":") ⇒ được giữ lại', () => {
    const out = renderStudentMessage(
      { student_reply: { template: 'Chúc em học tốt.\n{{pronunciation_errors}}' } },
      { ...BASE, scores: {} },
    );
    expect(out).toBe('Chúc em học tốt.');
  });

  it('nội dung thật trùng dạng {{...}} KHÔNG bị coi là dòng placeholder rỗng', () => {
    const out = renderStudentMessage(
      { student_reply: { template: 'Nhãn:\n{{feedback}}' } },
      { ...BASE, feedback: '{{khong_ton_tai}}' },
    );
    expect(out).toContain('Nhãn:');
  });

  /**
   * Quan sát từ dữ liệu thật 2026-09-06: model dùng `mispronounced_words` cho lỗi CHỌN TỪ
   * (success ↔ successful) và trả `heard_as` trùng hệt `word`. In nguyên sẽ ra câu vô nghĩa.
   */
  it('heard_as trùng word ⇒ bỏ vế "em đọc thành", vẫn giữ gợi ý', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{pronunciation_errors}}' } },
      {
        ...BASE,
        scores: {
          pronunciation: {
            score: 3,
            comment: '',
            mispronounced_words: [
              { word: 'success', heard_as: 'Success', suggestion: "Dùng 'successful'.", approx_position_sec: 12 },
            ],
          },
        },
      },
    );
    expect(out).toBe('• 0:12 — "success" → Dùng \'successful\'.');
    expect(out).not.toContain('em đọc thành');
  });

  it('scores sai kiểu ⇒ trả về feedback thay vì ném lỗi', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{feedback}}{{pronunciation_errors}}' } },
      { ...BASE, scores: 'hỏng' },
    );
    expect(out).toBe('Em làm tốt lắm!');
  });

  it('gom từ phát âm sai ở BẤT KỲ chiều nào, không chỉ khóa "pronunciation"', () => {
    const out = renderStudentMessage(
      { student_reply: { template: '{{pronunciation_errors}}' } },
      { ...BASE, scores: { am_chinh: { score: 2, comment: '', mispronounced_words: [{ word: 'cat' }] } } },
    );
    expect(out).toBe('• "cat"');
  });
});

describe('formatTimestamp', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [43, '0:43'],
    [165, '2:45'],
    [3599, '59:59'],
    [-5, '0:00'],
  ])('%s giây ⇒ %s', (input, expected) => {
    expect(formatTimestamp(input)).toBe(expected);
  });
});
