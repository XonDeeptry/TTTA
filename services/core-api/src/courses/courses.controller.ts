import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Course } from '@prisma/client';
import type { Request } from 'express';
import { canSeeEngine, withoutLlmConfig } from '../lib/hide-engine';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

/**
 * List: admin+staff (cần để chọn courseId ở Students/Criteria/Test Upload) — nhưng `llmConfig`
 * chỉ trả cho admin (lib/hide-engine.ts). Write: admin-only.
 */
@Controller('courses')
@UseGuards(SessionAuthGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  async list(@Req() req: Request): Promise<Course[] | Omit<Course, 'llmConfig'>[]> {
    const rows = await this.courses.list();
    return canSeeEngine(req.session.user?.role) ? rows : withoutLlmConfig(rows);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() body: CreateCourseDto): Promise<Course> {
    return this.courses.create(body);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCourseDto): Promise<Course> {
    return this.courses.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.courses.delete(id);
  }
}
