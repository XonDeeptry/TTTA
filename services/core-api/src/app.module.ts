import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { DlqModule } from './dlq/dlq.module';
import { HealthController } from './health.controller';
import { MediaModule } from './media/media.module';
import { MessageTemplatesModule } from './message-templates/message-templates.module';
import { MissingSubmissionsModule } from './missing-submissions/missing-submissions.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma.module';
import { RabbitModule } from './rabbit.module';
import { RedisModule } from './redis.module';
import { SettingsModule } from './settings/settings.module';
import { SheetsSyncModule } from './sheets-sync/sheets-sync.module';
import { WorkerApiModule } from './worker-api/worker-api.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RabbitModule,
    ScheduleModule.forRoot(),
    SettingsModule,
    AuthModule,
    MessageTemplatesModule,
    OnboardingModule,
    SheetsSyncModule,
    MissingSubmissionsModule,
    WorkerApiModule,
    DlqModule,
    MediaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
