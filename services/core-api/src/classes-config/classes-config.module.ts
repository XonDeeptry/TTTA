import { Module } from '@nestjs/common';
import { ClassesConfigController } from './classes-config.controller';
import { ClassesConfigService } from './classes-config.service';

@Module({
  controllers: [ClassesConfigController],
  providers: [ClassesConfigService],
})
export class ClassesConfigModule {}
