import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ClassConfig } from '@prisma/client';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ClassesConfigService } from './classes-config.service';
import { UpsertClassConfigDto } from './dto/upsert-class-config.dto';

/** Phân hệ 5 (mục 3.7): bật/tắt auto_send theo lớp. */
@Controller('classes-config')
@UseGuards(SessionAuthGuard)
export class ClassesConfigController {
  constructor(private readonly classesConfig: ClassesConfigService) {}

  @Get()
  list(): Promise<ClassConfig[]> {
    return this.classesConfig.list();
  }

  @Put(':className')
  upsert(@Param('className') className: string, @Body() body: UpsertClassConfigDto): Promise<ClassConfig> {
    return this.classesConfig.upsert(className, body.advisorZaloId, body.autoSend);
  }
}
