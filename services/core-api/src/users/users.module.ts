import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Không cần `imports` và không cần khai báo guard làm provider: PrismaService đến từ
 * PrismaModule (@Global), còn RolesGuard chỉ phụ thuộc Reflector do Nest tự cung cấp —
 * giống hệt monitoring.module.ts.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
