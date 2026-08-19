import { BadRequestException, Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UploadTestSubmissionDto } from './dto/upload-test-submission.dto';
import { TestUploadResult, TestUploadService } from './test-upload.service';

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

/** Admin-only dev tool — xem test-upload.service.ts. */
@Controller('test-upload')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
export class TestUploadController {
  constructor(private readonly testUpload: TestUploadService) {}

  @Post('submissions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @Body() body: UploadTestSubmissionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<TestUploadResult> {
    if (!file) throw new BadRequestException('missing file field "file" (audio/video)');
    return this.testUpload.upload(body.studentId, file);
  }
}
