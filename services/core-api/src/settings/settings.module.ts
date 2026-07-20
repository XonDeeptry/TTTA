import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * @Global() vì SettingsService.getRaw là dependency của InternalTokenGuard, dùng qua
 * @UseGuards() ở nhiều module (worker-api, onboarding…) — Nest cần resolve được guard đó
 * trong chính injector của module tiêu thụ, không chỉ nơi AuthModule import nó.
 */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
