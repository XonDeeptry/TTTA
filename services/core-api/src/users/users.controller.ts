import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService, UserView } from './users.service';

/**
 * Quản lý tài khoản dashboard — CHỈ admin (F5-ba.md §1). Bộ guard đặt ở cấp class
 * y hệt settings.controller.ts / monitoring.controller.ts: SessionAuthGuard trước
 * (chưa đăng nhập => 401 "login required"), RolesGuard sau (staff => 403
 * "insufficient role"). Không handler nào được nới lỏng bộ guard này.
 *
 * PATCH (sửa email/role) và DELETE (xóa) thêm 2026-08-19 — đảo ngược quyết định BR-7 gốc
 * của F5 (từng cố ý KHÔNG có 2 route này) theo yêu cầu chủ dự án. Bất biến an toàn cũ
 * ("số lượng admin không bao giờ về 0", "không ai tự khoá mình ra ngoài") vẫn giữ nguyên,
 * chỉ chuyển cách thực thi sang `UsersService#assertOtherAdminExists` + chặn tự xóa chính
 * mình — xem chi tiết trong users.service.ts.
 */
@Controller('users')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserView[]> {
    return this.users.list();
  }

  /** 201 (mặc định của Nest cho @Post) + UserView của tài khoản vừa tạo. */
  @Post()
  create(@Body() body: CreateUserDto): Promise<UserView> {
    return this.users.create(body);
  }

  /**
   * 200 (không phải tạo mới nên ép @HttpCode(200)). Id của admin đang thao tác được
   * lấy từ session và truyền xuống service để quy tắc "không tự reset chính mình"
   * (BR-5) kiểm được ở tầng service, không phụ thuộc vào việc giả lập Request.
   */
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<UserView> {
    const sessionUser = req.session.user;
    // Lớp phòng thủ thứ hai: SessionAuthGuard đã chặn trước đó.
    if (!sessionUser) throw new UnauthorizedException('login required');
    return this.users.resetPassword(id, sessionUser.id, body.newPassword);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserDto): Promise<UserView> {
    return this.users.update(id, body);
  }

  /** Id của admin thao tác lấy từ session để chặn tự xóa chính mình ở tầng service. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request): Promise<void> {
    const sessionUser = req.session.user;
    if (!sessionUser) throw new UnauthorizedException('login required');
    await this.users.delete(id, sessionUser.id);
  }
}
