/**
 * Soạn tin nhắn gửi HỌC VIÊN từ dữ liệu chấm ĐÃ ĐƯỢC VALIDATE, thay vì trông chờ LLM tự nhắc
 * lại lỗi trong đoạn tóm tắt.
 *
 * Vì sao không nhờ LLM: `feedback` là văn xuôi tự do, còn `scores.pronunciation.mispronounced_words`
 * là dữ liệu đã qua JSON Schema. Đo thực tế ngày 2026-09-06 cho thấy LLM tìm ra 3 từ sai kèm IPA và
 * mốc giây, nhưng đoạn tóm tắt nó tự viết chỉ nói chung chung "luyện thêm một số từ khó" — không
 * nêu tên từ nào. Chấm điểm vốn không tái lập được (changelog v1.6), nên nhắc lại bằng prompt là
 * thứ hôm nay có mai mất; dựng từ dữ liệu thì luôn có.
 *
 * TƯƠNG THÍCH NGƯỢC — theo đúng tiền lệ F11 (nút bấm): rubric KHÔNG khai `student_reply.template`
 * thì tin nhắn ra y hệt như trước, từng byte. Đây là tính năng bật-bằng-rubric, không phải thay đổi
 * mặc định áp lên mọi khóa đang chạy.
 */

/** Đúng hình dạng `mispronounced_words` mà `grading/schema.py` bắt LLM trả về. */
interface MispronouncedWord {
  word?: unknown;
  heard_as?: unknown;
  suggestion?: unknown;
  approx_position_sec?: unknown;
}

export interface StudentMessageInput {
  feedback: string;
  scores: unknown;
  totalScore?: number | null;
  totalMax?: number | null;
  levelLabel?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** mm:ss — học viên tua tay trong Zalo, nên phải là giờ người đọc chứ không phải số giây thô. */
export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Gom các từ phát âm sai từ MỌI chiều, không chỉ `pronunciation` — rubric do giáo viên soạn nên
 * không có gì bảo đảm chiều phát âm luôn mang đúng khóa đó ở mọi khóa học.
 */
function collectMispronounced(scores: unknown): MispronouncedWord[] {
  if (!isRecord(scores)) return [];
  const out: MispronouncedWord[] = [];
  for (const dimension of Object.values(scores)) {
    if (!isRecord(dimension)) continue;
    const words = dimension.mispronounced_words;
    if (Array.isArray(words)) out.push(...words.filter(isRecord));
  }
  return out;
}

function renderPronunciationErrors(scores: unknown): string {
  const lines: string[] = [];
  for (const entry of collectMispronounced(scores)) {
    const word = asText(entry.word);
    if (!word) continue; // không có tên từ thì dòng đó vô nghĩa với học viên
    const at =
      typeof entry.approx_position_sec === 'number' && Number.isFinite(entry.approx_position_sec)
        ? `${formatTimestamp(entry.approx_position_sec)} — `
        : '';
    const heardRaw = asText(entry.heard_as);
    // Quan sát 2026-09-06: model đôi khi dùng `mispronounced_words` cho lỗi CHỌN TỪ chứ không
    // phải lỗi phát âm, và trả `heard_as` trùng hệt `word` (vd. success/success). In ra sẽ thành
    // «"success" em đọc thành "success"» — vô nghĩa với học viên. Bỏ vế "nghe thành" khi không có
    // tương phản; phần `suggestion` vẫn giữ vì nó mới là lời khuyên hữu ích.
    const heard = heardRaw.toLowerCase() === word.toLowerCase() ? '' : heardRaw;
    const suggestion = asText(entry.suggestion);
    let line = `• ${at}"${word}"`;
    if (heard) line += ` em đọc thành "${heard}"`;
    if (suggestion) line += ` → ${suggestion}`;
    lines.push(line);
  }
  return lines.join('\n');
}

function renderFixes(scores: unknown): string {
  if (!isRecord(scores)) return '';
  const lines: string[] = [];
  for (const dimension of Object.values(scores)) {
    if (!isRecord(dimension)) continue;
    const fix = asText(dimension.fix);
    if (fix) lines.push(`• ${fix}`);
  }
  return lines.join('\n');
}

/**
 * Thay thế MỘT LƯỢT: quét chuỗi gốc đúng một lần nên nội dung vừa chèn vào KHÔNG bị coi là
 * placeholder để thay tiếp. Nếu không, một nhận xét của LLM vô tình chứa `{{total}}` sẽ được
 * thay thật — tức là để LLM điều khiển được cấu trúc tin nhắn.
 */
function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => {
    const replacement = values[key.toLowerCase()];
    return replacement === undefined ? whole : replacement;
  });
}

/**
 * Xóa những dòng CHỈ chứa placeholder đã resolve ra rỗng, kèm dòng nhãn ngay trước nó.
 *
 * Vì sao cần: giáo viên soạn mẫu rất tự nhiên sẽ viết
 *     Em chú ý mấy từ này nhé:
 *     {{pronunciation_errors}}
 * Bài nào không có từ sai thì dòng nhãn sẽ treo lơ lửng không có gì bên dưới — trông như hệ
 * thống lỗi. Quy tắc: dòng chỉ-có-placeholder mà rỗng thì bỏ; và nếu dòng giữ lại ngay trước
 * nó kết thúc bằng dấu ':' thì đó là nhãn của chính khối vừa bị bỏ, nên bỏ luôn.
 */
function dropEmptySections(lines: string[], isEmptyPlaceholderLine: (line: string) => boolean): string[] {
  const kept: string[] = [];
  for (const line of lines) {
    if (isEmptyPlaceholderLine(line)) {
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].trim() === '') continue; // bỏ qua dòng trống đệm để tìm tới nhãn
        if (kept[i].trimEnd().endsWith(':')) kept.splice(i, 1);
        break;
      }
      continue;
    }
    kept.push(line);
  }
  return kept;
}

/** Bỏ dòng trống thừa do placeholder rỗng để lại — tin nhắn Zalo không nên có khoảng hở lớn. */
function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderStudentMessage(rubric: unknown, input: StudentMessageInput): string {
  const feedback = input.feedback ?? '';
  const studentReply = isRecord(rubric) ? rubric.student_reply : undefined;
  if (!isRecord(studentReply)) return feedback;

  const total =
    typeof input.totalScore === 'number' && typeof input.totalMax === 'number'
      ? `${input.totalScore}/${input.totalMax}`
      : '';
  const level = asText(input.levelLabel);

  const template = asText(studentReply.template);
  if (template) {
    const values: Record<string, string> = {
      feedback,
      total,
      level,
      pronunciation_errors: renderPronunciationErrors(input.scores),
      fixes: renderFixes(input.scores),
    };
    // Xác định dòng "chỉ có placeholder rỗng" TRƯỚC khi thay, để nội dung thật vô tình trùng
    // dạng `{{...}}` không bị nhận nhầm là placeholder.
    const isEmptyPlaceholderLine = (line: string): boolean => {
      const trimmed = line.trim();
      const match = /^\{\{\s*([a-z_]+)\s*\}\}$/i.exec(trimmed);
      if (!match) return false;
      const value = values[match[1].toLowerCase()];
      return value !== undefined && value === '';
    };
    const lines = dropEmptySections(template.split('\n'), isEmptyPlaceholderLine);
    return tidy(fillPlaceholders(lines.join('\n'), values));
  }

  // Không có template ⇒ vẫn tôn trọng hai công tắc đã có trong schema từ F11.
  const parts = [feedback];
  if (studentReply.show_total === true && total) parts.push(`Tổng điểm: ${total}`);
  if (studentReply.show_level === true && level) parts.push(`Cấp độ: ${level}`);
  return tidy(parts.join('\n\n'));
}
