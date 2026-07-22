import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { EventsService } from './events.service';

/**
 * SSE realtime trạng thái submission (F6) — chiếu read-only, phụ trợ cho REST baseline.
 * Session-auth: bất kỳ ai đã đăng nhập (cùng mức truy cập với danh sách Submissions).
 * `EventSource` không set được header nhưng request là GET same-origin nên cookie session
 * (`sameSite:'lax'`) tự gửi — không cần wiring auth mới. Không session -> 401 (guard ném).
 */
@Controller('events')
@UseGuards(SessionAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Dùng `@Res()` (không passthrough) để ghi trực tiếp vào stream Express, KHÔNG qua JSON
   * serializer của Nest và KHÔNG trả về giá trị. Toàn bộ vòng đời stream/cleanup nằm trong service.
   */
  @Get('submissions')
  submissions(@Req() req: Request, @Res() res: Response): void {
    this.events.stream(req, res);
  }
}
