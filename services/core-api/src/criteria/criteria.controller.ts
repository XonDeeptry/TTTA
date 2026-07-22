import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Criteria } from '@prisma/client';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CriteriaService } from './criteria.service';
import { UploadCriteriaDto } from './dto/upload-criteria.dto';

/** Phân hệ 5 (mục 3.7/3.9): upload .docx, preview rubric JSON. */
@Controller('criteria')
@UseGuards(SessionAuthGuard)
export class CriteriaController {
  constructor(private readonly criteria: CriteriaService) {}

  @Get()
  list(@Query('courseId', ParseIntPipe) courseId: number): Promise<Criteria[]> {
    return this.criteria.list(courseId);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<Criteria> {
    return this.criteria.get(id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body() body: UploadCriteriaDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Criteria> {
    if (!file) throw new BadRequestException('missing file field "file" (.docx)');
    return this.criteria.ingestDocx(body.courseId, file.buffer, file.originalname);
  }
}
