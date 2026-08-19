import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Student } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentPage, StudentsService } from './students.service';

/** Phân hệ 2 (mục 3.7) — cả admin lẫn staff (tư vấn/giáo viên) đều dùng được. */
@Controller('students')
@UseGuards(SessionAuthGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(@Query('search') search?: string, @Query('page') page = '1'): Promise<StudentPage> {
    return this.students.list(search, Number(page) || 1);
  }

  /** Thêm tay (admin-only) — luồng chính vẫn là cron Sheets sync, xem students.service.ts. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() body: CreateStudentDto): Promise<Student> {
    return this.students.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateStudentDto): Promise<Student> {
    return this.students.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.students.delete(id);
  }
}
