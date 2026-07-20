import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService, SettingView } from './settings.service';

@Controller('settings')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list(): Promise<SettingView[]> {
    return this.settings.list();
  }

  @Put(':key')
  upsert(
    @Param('key') key: string,
    @Body() body: UpsertSettingDto,
    @Req() req: Request,
  ): Promise<{ key: string; ok: true }> {
    return this.settings.upsert(key, body.value, req.session.user?.email);
  }
}
