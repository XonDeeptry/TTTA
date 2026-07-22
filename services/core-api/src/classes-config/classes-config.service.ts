import { Injectable } from '@nestjs/common';
import { ClassConfig } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ClassesConfigService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ClassConfig[]> {
    return this.prisma.classConfig.findMany({ orderBy: { className: 'asc' } });
  }

  upsert(className: string, advisorZaloId: string, autoSend?: boolean): Promise<ClassConfig> {
    return this.prisma.classConfig.upsert({
      where: { className },
      create: { className, advisorZaloId, autoSend: autoSend ?? false },
      update: { advisorZaloId, ...(autoSend !== undefined ? { autoSend } : {}) },
    });
  }
}
