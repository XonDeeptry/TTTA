import { Body, Controller, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Grading } from '@prisma/client';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UpdateGradingDto } from './dto/update-grading.dto';
import { GradingsService } from './gradings.service';

@Controller('gradings')
@UseGuards(SessionAuthGuard)
export class GradingsController {
  constructor(private readonly gradings: GradingsService) {}

  @Patch(':id')
  review(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateGradingDto, @Req() req: Request): Promise<Grading> {
    return this.gradings.review(id, body, req.session.user?.email ?? 'unknown');
  }

  /** D153: body tùy chọn — có bản đang sửa thì LƯU trước rồi gửi đúng bản đó, tránh "quên bấm Lưu". */
  @Post(':id/send')
  send(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateGradingDto, @Req() req: Request): Promise<Grading> {
    return this.gradings.send(id, body, req.session.user?.email ?? 'unknown');
  }
}
