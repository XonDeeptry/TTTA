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
    return this.gradings.reviewFeedback(id, body.reviewedFeedback, req.session.user?.email ?? 'unknown');
  }

  @Post(':id/send')
  send(@Param('id', ParseIntPipe) id: number): Promise<Grading> {
    return this.gradings.send(id);
  }
}
