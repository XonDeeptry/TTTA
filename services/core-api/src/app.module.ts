import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ClassesConfigModule } from './classes-config/classes-config.module';
import { CriteriaModule } from './criteria/criteria.module';
import { DlqModule } from './dlq/dlq.module';
import { GradingsModule } from './gradings/gradings.module';
import { HealthController } from './health.controller';
import { MediaLifecycleModule } from './media-lifecycle/media-lifecycle.module';
import { MediaModule } from './media/media.module';
import { MessageTemplatesModule } from './message-templates/message-templates.module';
import { MissingSubmissionsModule } from './missing-submissions/missing-submissions.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma.module';
import { RabbitModule } from './rabbit.module';
import { RedisModule } from './redis.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SheetsSyncModule } from './sheets-sync/sheets-sync.module';
import { StudentsModule } from './students/students.module';
import { SubmissionsModule } from './submissions/submissions.module';
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
    MediaLifecycleModule,
    StudentsModule,
    SubmissionsModule,
    GradingsModule,
    ClassesConfigModule,
    CriteriaModule,
    ReportsModule,
    MonitoringModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
