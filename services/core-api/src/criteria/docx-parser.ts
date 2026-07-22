import mammoth from 'mammoth';
import { BadRequestException } from '@nestjs/common';

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
 */

export interface RubricDimension {
  name: string;
  weight: number;
  bands: Record<string, string>;
}

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

function parseDimensions(paragraphs: string[]): RubricDimension[] {
  const dimensionLine = /^([a-zA-Z_]+)\s*\(\s*trọng số\s*([\d.]+)\s*\)\s*:\s*(.+)$/i;
  const dimensions: RubricDimension[] = [];
  for (const line of paragraphs) {
    const match = dimensionLine.exec(line);
    if (!match) continue;
    const [, name, weight, bandsRaw] = match;
    const bands: Record<string, string> = {};
    for (const bandEntry of bandsRaw.split(';')) {
      const bandMatch = /^\s*(\d+)\s*=\s*(.+)$/.exec(bandEntry);
      if (bandMatch) bands[bandMatch[1]] = bandMatch[2].trim();
    }
    dimensions.push({ name: name.trim(), weight: Number(weight), bands });
  }
  return dimensions;
}

export function parseRubricFromHtml(html: string): RubricJson {
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
  if (!dimensions.some((d) => d.name.toLowerCase() === 'pronunciation')) {
    throw new BadRequestException(
      'Rubric thiếu dimension bắt buộc "pronunciation" (mục 3.10) — không thể lưu tiêu chí này',
    );
  }

  const bandScaleRaw = general['thang điểm'] ?? '0-3';
  const [min, max] = bandScaleRaw.split('-').map((n) => Number(n.trim()));

  return {
    course_key: general['khóa'],
    task_type: general['loại bài'] ?? 'speaking_clip',
    band_scale: [min ?? 0, max ?? 3],
    feedback_language: toneSection['ngôn ngữ nhận xét'] ?? 'vi',
    tone: toneSection['giọng điệu'] ?? 'khích lệ',
    dimensions,
    few_shot_examples: examples,
  };
}

export async function parseRubricFromDocxBuffer(buffer: Buffer): Promise<RubricJson> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return parseRubricFromHtml(html);
}
