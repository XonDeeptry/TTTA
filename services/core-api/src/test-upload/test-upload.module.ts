import { Module } from '@nestjs/common';
import { TestUploadController } from './test-upload.controller';
import { TestUploadService } from './test-upload.service';

@Module({
  controllers: [TestUploadController],
  providers: [TestUploadService],
})
export class TestUploadModule {}
