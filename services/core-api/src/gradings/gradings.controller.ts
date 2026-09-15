import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Grading } from '@prisma/client';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UpdateGradingDto } from './dto/update-grading.dto';
import { GradingsService, WordReviewStats } from './gradings.service';

@Controller('gradings')
@UseGuards(SessionAuthGuard)
export class GradingsController {
  constructor(private readonly gradings: GradingsService) {}

  /**
   * ILM 09-15: AI ↔ giáo viên trên từ phát âm sai, `days` ngày gần nhất (mặc định 30). CHỈ admin
   * (Chủ tịch, vận hành hệ thống) — giáo viên/học thuật không xem số liệu này, như trang Giám sát.
   */
  @Get('word-review-stats')
  @UseGuards(RolesGuard)
  @Roles('admin')
  wordReviewStats(@Query('days') days?: string): Promise<WordReviewStats> {
    return this.gradings.wordReviewStats(Number(days) || 30);
  }

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
