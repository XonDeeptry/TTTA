import mammoth from 'mammoth';
import { BadRequestException } from '@nestjs/common';
import { PRONUNCIATION_DIMENSION, RubricDimensionV2, RubricV2 } from './rubric-schema';

/**
 * Bóc .docx theo template chuẩn (mục 3.9) — 4 heading bắt buộc, mỗi heading dùng một
 * mini-format cố định để bóc tự động không mơ hồ (xem scripts/generate-rubric-template.ts
 * cho ví dụ đầy đủ, đúng format parser này chấp nhận):
 *
 *   ## Thông tin chung
 *   Khóa: <course_key>
 *   Loại bài: <task_type>
 *   Thang điểm: <min>-<max>
 *
 *   ## Tiêu chí
 *   <tên> (trọng số <weight>): <band>=<mô tả>; <band>=<mô tả>; ...
 *   (một dòng/đoạn cho mỗi tiêu chí — BẮT BUỘC có một dòng tên "pronunciation")
 *
 *   ## Giọng điệu & ngôn ngữ nhận xét
 *   Giọng điệu: <tone>
 *   Ngôn ngữ nhận xét: <vi|en|bilingual>
 *
 *   ## Ví dụ nhận xét mẫu
 *   <mỗi đoạn là một ví dụ>
 *
 * F8: MINI-FORMAT KHÔNG ĐỔI (không thêm heading, không thêm cú pháp dòng) — chỉ SHAPE đầu ra
 * đổi từ v1 sang v2 (`RubricV2`). Soạn nhiều gạch đầu dòng cho một band, yếu tố con, ngân hàng
 * nhận xét theo tiêu chí và `student_reply` chỉ soạn được qua JSON/UI (F12), không qua .docx.
 */

/** @deprecated Shape v1 — giữ lại để tra cứu/đối chiếu dữ liệu cũ đã lưu; KHÔNG còn là kiểu
 * trả về của parser (F8 FR-06). Rubric v1 vẫn nằm nguyên trong DB và được `normalizeRubric()`
 * nâng lên v2 lúc đọc. */
export interface RubricDimension {
  name: string;
  weight: number;
  bands: Record<string, string>;
}

/** @deprecated Shape v1 — xem chú thích ở `RubricDimension`. */
export interface RubricJson {
  course_key: string;
  task_type: string;
  band_scale: [number, number];
  feedback_language: string;
  tone: string;
  dimensions: RubricDimension[];
  few_shot_examples: string[];
}

const HEADINGS = {
  general: 'thông tin chung',
  criteria: 'tiêu chí',
  tone: 'giọng điệu & ngôn ngữ nhận xét',
  examples: 'ví dụ nhận xét mẫu',
} as const;

/** Tiêu chí bóc thô từ .docx, trước khi đúc sang shape v2. */
interface ParsedDimension {
  name: string;
  weight: number;
  bands: Record<string, string>;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** Tách HTML (do mammoth convertToHtml sinh ra) thành các section theo heading <h1-6>. */
function splitSections(html: string): Map<string, string[]> {
  const parts = html.split(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
  const sections = new Map<string, string[]>();
  // parts[0] là nội dung trước heading đầu tiên (bỏ qua); sau đó xen kẽ [heading, body, heading, body, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const heading = stripHtmlTags(parts[i]).toLowerCase();
    const bodyHtml = parts[i + 1] ?? '';
    const paragraphs = bodyHtml
      .split(/<\/p>/i)
      .map(stripHtmlTags)
      .filter((p) => p.length > 0);
    sections.set(heading, paragraphs);
  }
  return sections;
}

function parseKeyValueLines(paragraphs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of paragraphs) {
    const match = /^([^:]+):\s*(.+)$/.exec(line);
    if (match) map[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return map;
}

function parseDimensions(paragraphs: string[]): ParsedDimension[] {
  const dimensionLine = /^([a-zA-Z_]+)\s*\(\s*trọng số\s*([\d.]+)\s*\)\s*:\s*(.+)$/i;
  const dimensions: ParsedDimension[] = [];
  for (const line of paragraphs) {
    const match = dimensionLine.exec(line);
    if (!match) continue;
    const [, name, weight, bandsRaw] = match;
    const bands: Record<string, string> = {};
    // Dấu ';' vẫn là dấu tách BAND (không phải tách gạch đầu dòng trong một band) — giữ đúng
    // nghĩa cũ để file .docx giáo viên đã soạn không bị hiểu khác đi.
    for (const bandEntry of bandsRaw.split(';')) {
      const bandMatch = /^\s*(\d+)\s*=\s*(.+)$/.exec(bandEntry);
      if (bandMatch) bands[bandMatch[1]] = bandMatch[2].trim();
    }
    dimensions.push({ name: name.trim(), weight: Number(weight), bands });
  }
  return dimensions;
}

/** "0-3" → {min:0, max:3, step:1}. Số hỏng ⇒ rơi về thang mặc định toàn repo (BR-06), KHÔNG
 * phát sinh lý do từ chối mới (AC-07.3). */
function parseScale(raw: string | undefined): RubricV2['scale'] {
  const [minRaw, maxRaw] = (raw ?? '0-3').split('-').map((n) => Number(n.trim()));
  return {
    min: Number.isFinite(minRaw) ? minRaw : 0,
    max: Number.isFinite(maxRaw) ? maxRaw : 3,
    step: 1,
  };
}

/**
 * `key` hạ chữ thường, `label` giữ nguyên như giáo viên gõ trong file (BR-08).
 * Lý do: cổng chặn lúc upload so sánh KHÔNG phân biệt hoa/thường, còn cổng chặn lúc chấm
 * (grading-worker) so sánh CHÍNH XÁC — hạ chữ thường ngay lúc bóc file làm hai cổng khớp nhau
 * với mọi rubric tạo từ F8 trở đi. Rubric v1 đã lưu thì KHÔNG bị đụng vào (BR-07).
 */
function toV2Dimension(parsed: ParsedDimension): RubricDimensionV2 {
  const bands: Record<string, string[]> = {};
  for (const [band, desc] of Object.entries(parsed.bands)) bands[band] = [desc];
  return {
    key: parsed.name.trim().toLowerCase(),
    label: parsed.name.trim(),
    weight: Number.isFinite(parsed.weight) ? parsed.weight : 1,
    bands,
    sub_factors: [],
  };
}

export function parseRubricFromHtml(html: string): RubricV2 {
  const sections = splitSections(html);

  const general = parseKeyValueLines(sections.get(HEADINGS.general) ?? []);
  const toneSection = parseKeyValueLines(sections.get(HEADINGS.tone) ?? []);
  const dimensions = parseDimensions(sections.get(HEADINGS.criteria) ?? []);
  const examples = sections.get(HEADINGS.examples) ?? [];

  if (!general['khóa'] || !dimensions.length) {
    throw new BadRequestException(
      'File .docx không đúng template chuẩn — thiếu heading "Thông tin chung" hoặc "Tiêu chí" (mục 3.9)',
    );
  }
  // Cổng chặn BẮT BUỘC (mục 3.10) — KHÔNG ĐỔI ở F8, kể cả câu thông báo.
  if (!dimensions.some((d) => d.name.toLowerCase() === PRONUNCIATION_DIMENSION)) {
    throw new BadRequestException(
      'Rubric thiếu dimension bắt buộc "pronunciation" (mục 3.10) — không thể lưu tiêu chí này',
    );
  }

  return {
    schema_version: 2,
    course_key: general['khóa'],
    task_type: general['loại bài'] ?? 'speaking_clip',
    tone: toneSection['giọng điệu'] ?? 'khích lệ',
    feedback_language: toneSection['ngôn ngữ nhận xét'] ?? 'vi',
    scale: parseScale(general['thang điểm']),
    // .docx chưa soạn được cách tổng hợp điểm / mốc cấp độ / trường `fix` ⇒ mặc định giữ
    // đúng hành vi báo cáo hiện tại (BR-03).
    aggregation: { method: 'average', round: 'none' },
    levels: [],
    output_fields: ['comment'],
    dimensions: dimensions.map(toV2Dimension),
    comment_bank: examples.map((text) => ({ dimension: null, intent: null, text })),
    student_reply: null,
  };
}

export async function parseRubricFromDocxBuffer(buffer: Buffer): Promise<RubricV2> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return parseRubricFromHtml(html);
}
