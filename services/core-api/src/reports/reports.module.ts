import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController, AnalyticsController],
  providers: [ReportsService],
})
export class ReportsModule {}
