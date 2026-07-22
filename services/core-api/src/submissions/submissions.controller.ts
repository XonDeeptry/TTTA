import { Controller, Delete, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { Submission } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SubmissionPage, SubmissionsService } from './submissions.service';

/** Phân hệ 3 (mục 3.7) — bảng trạng thái + màn Kiểm duyệt. */
@Controller('submissions')
@UseGuards(SessionAuthGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  list(@Query('status') status?: string, @Query('page') page = '1'): Promise<SubmissionPage> {
    return this.submissions.list(status, Number(page) || 1);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.submissions.detail(id);
  }

  /** Xóa media theo yêu cầu quyền riêng tư (mục 3.7 phân hệ 3) — chỉ admin. */
  @Delete(':id/media')
  @UseGuards(RolesGuard)
  @Roles('admin')
  deleteMedia(@Param('id', ParseIntPipe) id: number): Promise<Submission> {
    return this.submissions.deleteMedia(id);
  }
}
