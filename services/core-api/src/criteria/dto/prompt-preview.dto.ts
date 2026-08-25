import { Allow, IsIn, ValidateIf } from 'class-validator';
import { PROMPT_VARIANTS, type PromptVariant } from '../prompt-render';

/**
 * Body của `POST /criteria/prompt-preview` (F12 FR-02, §7.2).
 *
 * XEM TRƯỚC LÀ DỄ DÃI, KHÔNG PHẢI CỔNG KIỂM (AC-02.3): người soạn đang gõ dở, một rubric chưa hợp
 * lệ vẫn phải render ra được. Vì vậy `rubric` chỉ `@Allow()` (giữ cho `whitelist: true` không cắt
 * mất) và KHÔNG hề gọi `assertAuthorableRubric` trên đường này — `normalizeRubric` bên trong bộ
 * render không bao giờ ném, nên rác cũng ra 200 kèm một chuỗi.
 *
 * Chỉ HÌNH THỨC PHONG BÌ mới 400: `variant` ngoài tập đóng `['audio','text']`.
 */
export class PromptPreviewDto {
  @Allow()
  rubric?: unknown;

  /** VẮNG MẶT (`undefined`) ⇒ mặc định 'audio'. Mọi giá trị khác — kể cả `null` — phải nằm trong
   * tập đóng, nếu không thì 400 (AC-02.2). Dùng `@ValidateIf` chứ KHÔNG dùng `@IsOptional()`:
   * `@IsOptional()` bỏ qua cả `null`, nên `variant: null` sẽ lặng lẽ thành 'audio'. */
  @ValidateIf((dto: PromptPreviewDto) => dto.variant !== undefined)
  @IsIn(PROMPT_VARIANTS)
  variant?: PromptVariant;
}
