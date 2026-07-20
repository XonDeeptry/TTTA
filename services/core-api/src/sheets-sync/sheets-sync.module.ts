import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { realSheetsClientFactory, SheetsSyncService } from './sheets-sync.service';
import { SheetsSyncController } from './sheets-sync.controller';
import { SHEETS_CLIENT_FACTORY } from './sheets-client';

@Module({
  imports: [SettingsModule],
  controllers: [SheetsSyncController],
  providers: [SheetsSyncService, { provide: SHEETS_CLIENT_FACTORY, useValue: realSheetsClientFactory }],
})
export class SheetsSyncModule {}
