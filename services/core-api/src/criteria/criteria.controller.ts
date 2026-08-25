import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Criteria } from '@prisma/client';
import { RequiresPrivilege } from '../auth/privilege.decorator';
import { PrivilegeGuard } from '../auth/privilege.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CriteriaService } from './criteria.service';
import { CreateCriteriaJsonDto } from './dto/create-criteria-json.dto';
import { CreateRubricTemplateDto } from './dto/create-rubric-template.dto';
import { DuplicateRubricTemplateDto } from './dto/duplicate-rubric-template.dto';
import { PromptPreviewDto } from './dto/prompt-preview.dto';
import { SetTemplateActiveDto } from './dto/set-template-active.dto';
import { UpdateRubricTemplateDto } from './dto/update-rubric-template.dto';
import { UploadCriteriaDto } from './dto/upload-criteria.dto';
import { renderPrompt, type PromptVariant } from './prompt-render';
import { RubricTemplateService, type RubricTemplateView } from './rubric-template.service';

/**
 * Phân hệ 5 (mục 3.7/3.9): upload .docx, preview rubric JSON — cộng thêm CRUD mẫu cấu trúc
 * chấm điểm của F10 (thiết kế mục 4.1).
 *
 * ⚠⚠ THỨ TỰ KHAI BÁO ROUTE LÀ MỘT RÀNG BUỘC, KHÔNG PHẢI SỞ THÍCH ⚠⚠
 * Nest/Express so khớp route THEO THỨ TỰ KHAI BÁO. `@Get(':id')` dùng `ParseIntPipe`, nên nếu nó
 * đứng TRƯỚC `@Get('templates')` thì `GET /criteria/templates` sẽ rơi vào handler đó và trả
 * 400 "Validation failed (numeric string is expected)" — một lỗi rất khó đoán ra khi đọc code.
 * Vì vậy MỌI route có đoạn chữ cố định phải khai báo TRƯỚC `@Get(':id')`. Thứ tự bắt buộc:
 *   GET '' → toàn bộ khối 'templates*' → POST 'json' + POST 'prompt-preview' (F12) → GET ':id' → POST ''.
 * Có test hành vi gọi thật từng route để một lần refactor sau này không lặng lẽ đảo thứ tự
 * (F10-ba.md FR-20, F12-ba.md AC-01.1).
 *
 * PHÂN QUYỀN (thiết kế mục 4.2): ĐỌC MỞ, GHI MỚI BỊ GÁC. Mọi `GET` chỉ cần SessionAuthGuard như
 * trước F10 — kể cả staff có `privileges = []`. Các route GHI mới cần quyền tương ứng:
 *   `rubric_template` cho CẤU TRÚC (create/duplicate/update/delete/active/reset),
 *   `criteria_author` cho NỘI DUNG (`POST /criteria` upload .docx, `POST /criteria/json`).
 * `POST /criteria/prompt-preview` không ghi gì cả nhưng vẫn gác bằng HOẶC hai quyền: nó chỉ có ích
 * cho người đang soạn, và giữ nó sau một cổng thì bề mặt công khai không rộng thêm.
 */
@Controller('criteria')
@UseGuards(SessionAuthGuard, PrivilegeGuard)
export class CriteriaController {
  constructor(
    private readonly criteria: CriteriaService,
    private readonly templates: RubricTemplateService,
  ) {}

  @Get()
  list(@Query('courseId', ParseIntPipe) courseId: number): Promise<Criteria[]> {
    return this.criteria.list(courseId);
  }

  // ─── KHỐI 'templates*' — PHẢI đứng trước @Get(':id'), xem chú thích đầu class ────────

  /** 1. Liệt kê. Đọc ⇒ chỉ session, không cần quyền phụ (AC-12.1). */
  @Get('templates')
  listTemplates(@Query('includeInactive') includeInactive?: string): Promise<RubricTemplateView[]> {
    return this.templates.list(includeInactive);
  }

  /** 2. Xem chi tiết. `:key` là CHUỖI — `GET /criteria/templates/123` phải ra 404, không phải
   * 400 của ParseIntPipe (AC-13.4). */
  @Get('templates/:key')
  getTemplate(@Param('key') key: string): Promise<RubricTemplateView> {
    return this.templates.get(key);
  }

  /** 3. Tạo mới ⇒ 201. */
  @Post('templates')
  @RequiresPrivilege('rubric_template')
  createTemplate(@Body() body: CreateRubricTemplateDto): Promise<RubricTemplateView> {
    return this.templates.create(body);
  }

  /** 4. Nhân bản ⇒ 201 (bản sao luôn là mẫu thường). */
  @Post('templates/:key/duplicate')
  @RequiresPrivilege('rubric_template')
  duplicateTemplate(
    @Param('key') key: string,
    @Body() body: DuplicateRubricTemplateDto,
  ): Promise<RubricTemplateView> {
    return this.templates.duplicate(key, body);
  }

  /** 5. Sửa ⇒ 200. Sửa được cả mẫu hệ thống, cả trường nằm trong `locked` của chính nó. */
  @Put('templates/:key')
  @RequiresPrivilege('rubric_template')
  updateTemplate(
    @Param('key') key: string,
    @Body() body: UpdateRubricTemplateDto,
  ): Promise<RubricTemplateView> {
    return this.templates.update(key, body);
  }

  /** 6. Xóa ⇒ 204. Mẫu hệ thống ⇒ 409. KHÔNG đụng tới `criteria` nào (AC-02.4). */
  @Delete('templates/:key')
  @HttpCode(204)
  @RequiresPrivilege('rubric_template')
  async removeTemplate(@Param('key') key: string): Promise<void> {
    await this.templates.remove(key);
  }

  /** 7. Ẩn / hiện ⇒ 200. */
  @Patch('templates/:key/active')
  @RequiresPrivilege('rubric_template')
  setTemplateActive(
    @Param('key') key: string,
    @Body() body: SetTemplateActiveDto,
  ): Promise<RubricTemplateView> {
    return this.templates.setActive(key, body.isActive);
  }

  /** 8. Khôi phục bản gốc ⇒ 200. Mẫu thường ⇒ 409. */
  @Post('templates/:key/reset')
  @HttpCode(200)
  @RequiresPrivilege('rubric_template')
  resetTemplate(@Param('key') key: string): Promise<RubricTemplateView> {
    return this.templates.reset(key);
  }

  // ─── HẾT khối 'templates*' ──────────────────────────────────────────────────────────

  /**
   * F12 FR-01 — lưu nội dung chấm điểm dạng JSON ⇒ 201, phiên bản mới. Đây là bên GHI DUY NHẤT của
   * `criteria.template_key`.
   *
   * Cổng rubric là ĐÚNG MỘT lời gọi `assertAuthorableRubric(dto.rubric)` ở tầng service, trên body
   * THÔ — controller KHÔNG được chuẩn hóa hay "dọn dẹp" rubric trước (F10 DEF-1).
   */
  @Post('json')
  @RequiresPrivilege('criteria_author')
  createFromJson(@Body() body: CreateCriteriaJsonDto): Promise<Criteria> {
    return this.criteria.createFromJson(body);
  }

  /**
   * F12 FR-02 — dựng trước ĐÚNG đoạn system instruction mà grading-worker sẽ gửi cho LLM.
   *
   * THUẦN: không Prisma, không Redis, không RabbitMQ — chỉ ráp chuỗi từ body của chính người gọi
   * (AC-02.1, NFR-05: không có bề mặt IDOR). 200 chứ không 201: không có gì được tạo ra.
   * Hai quyền là quan hệ HOẶC — cả hai drawer đều được xem trước.
   */
  @Post('prompt-preview')
  @HttpCode(200)
  @RequiresPrivilege('criteria_author', 'rubric_template')
  previewPrompt(@Body() body: PromptPreviewDto): { variant: PromptVariant; prompt: string } {
    const variant: PromptVariant = body.variant ?? 'audio';
    return { variant, prompt: renderPrompt(body.rubric, variant) };
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<Criteria> {
    return this.criteria.get(id);
  }

  /**
   * Upload .docx — đường GHI NỘI DUNG, nên gác bằng `criteria_author` (FR-09). Trước F10 route
   * này chỉ có SessionAuthGuard, tức là MỌI staff upload được; migration của F10 cấp sẵn
   * `criteria_author` cho toàn bộ staff đang tồn tại nên không ai mất quyền lúc deploy (AC-03.7).
   */
  @Post()
  @RequiresPrivilege('criteria_author')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body() body: UploadCriteriaDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Criteria> {
    if (!file) throw new BadRequestException('missing file field "file" (.docx)');
    return this.criteria.ingestDocx(body.courseId, file.buffer, file.originalname);
  }
}
