import { Controller, Get, UseGuards } from '@nestjs/common';
import { SheetSyncLog } from '@prisma/client';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PrismaService } from '../prisma.service';

@Controller('sheets-sync')
@UseGuards(SessionAuthGuard)
export class SheetsSyncController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('log')
  log(): Promise<SheetSyncLog[]> {
    return this.prisma.sheetSyncLog.findMany({ orderBy: { runAt: 'desc' }, take: 20 });
  }
}
