import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { Student } from '@prisma/client';
import { SessionAuthGuard } from '../auth/session-auth.guard';
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

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateStudentDto): Promise<Student> {
    return this.students.update(id, body);
  }
}
