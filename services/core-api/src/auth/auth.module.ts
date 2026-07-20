import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { InternalTokenGuard } from './internal-token.guard';

@Module({
  imports: [SettingsModule],
  controllers: [AuthController],
  providers: [AuthService, BootstrapAdminService, InternalTokenGuard],
  exports: [AuthService, InternalTokenGuard],
})
export class AuthModule {}
