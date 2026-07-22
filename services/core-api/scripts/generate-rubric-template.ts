/**
 * Sinh file mẫu templates/rubric-template.docx cho giáo viên (mục 3.9) — đúng format mà
 * src/criteria/docx-parser.ts bóc được. Chạy lại khi đổi convention:
 *   npx ts-node scripts/generate-rubric-template.ts
 */
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1 });
}

function body(text: string): Paragraph {
  return new Paragraph({ text });
}

const doc = new Document({
  sections: [
    {
      children: [
        heading('Thông tin chung'),
        body('Khóa: basic'),
        body('Loại bài: speaking_clip'),
        body('Thang điểm: 0-3'),

        heading('Tiêu chí'),
        body(
          'fluency (trọng số 0.25): 0=Nói rời rạc, nhiều khoảng ngừng; 1=Còn ngập ngừng nhưng hiểu được; ' +
            '2=Khá trôi chảy, thỉnh thoảng ngập ngừng; 3=Nói trôi chảy tự nhiên',
        ),
        body(
          'vocabulary (trọng số 0.25): 0=Từ vựng rất hạn chế; 1=Từ vựng cơ bản, lặp từ; ' +
            '2=Từ vựng khá đa dạng; 3=Từ vựng phong phú, dùng từ chính xác',
        ),
        body(
          'grammar (trọng số 0.25): 0=Lỗi ngữ pháp nhiều, khó hiểu; 1=Lỗi ngữ pháp thường xuyên nhưng vẫn hiểu; ' +
            '2=Ít lỗi ngữ pháp; 3=Ngữ pháp chính xác, câu phức tốt',
        ),
        body(
          'pronunciation (trọng số 0.25): 0=Phát âm sai nhiều, khó nghe; 1=Phát âm sai một số âm phổ biến; ' +
            '2=Phát âm khá rõ, còn vài lỗi nhỏ; 3=Phát âm chuẩn, rõ ràng',
        ),

        heading('Giọng điệu & ngôn ngữ nhận xét'),
        body('Giọng điệu: khích lệ'),
        body('Ngôn ngữ nhận xét: vi'),

        heading('Ví dụ nhận xét mẫu'),
        body('Em nói khá trôi chảy, cần chú ý phát âm âm cuối như "-ed", "-s" để rõ ràng hơn nhé.'),
        body('Bài làm tốt, từ vựng phong phú. Em luyện thêm thì quá khứ để câu chuyện mạch lạc hơn.'),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const outPath = resolve(__dirname, '../templates/rubric-template.docx');
  writeFileSync(outPath, buffer);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath}`);
});
