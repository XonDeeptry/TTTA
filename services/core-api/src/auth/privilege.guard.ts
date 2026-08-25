import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { PRIVILEGES_KEY } from './privilege.decorator';
import type { DashboardPrivilege } from './privileges';

/**
 * Gác quyền phụ. Dùng SAU SessionAuthGuard: `@UseGuards(SessionAuthGuard, PrivilegeGuard)` —
 * đúng thứ tự đã dùng cho `RolesGuard` ở users/settings/monitoring.
 *
 * ⚠ KHÁC RolesGuard MỘT ĐIỂM CÓ CHỦ Ý (F10-ba.md §9 D-1): guard này đọc `role`/`privileges` từ
 * POSTGRES theo `session.user.id` ở MỖI request, không đọc bản sao trong session. Lý do: quyền
 * được admin cấp GIỮA CHỪNG một phiên. Nếu đọc từ session thì giáo viên vừa được cấp quyền phải
 * đăng xuất/đăng nhập lại mới dùng được — mà core-api cũng không có cách nào sửa session đang sống
 * của người khác. Giá phải trả là MỘT truy vấn khóa chính, và chỉ trên các route GHI (đọc vẫn mở),
 * nên đường đọc nặng của dashboard không tốn thêm gì (NFR-P2).
 *
 * Không có metadata ⇒ cho qua NGAY, không chạm DB (AC-08.4) — nhờ vậy đặt guard ở cấp class trên
 * một controller có route đọc công khai vẫn an toàn.
 */
@Injectable()
export class PrivilegeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<DashboardPrivilege[]>(PRIVILEGES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const sessionUser = req.session?.user;
    // Lớp phòng thủ thứ hai — SessionAuthGuard thường đã chặn trước (AC-08.5).
    if (!sessionUser) throw new UnauthorizedException('login required');

    // ĐÚNG MỘT truy vấn cho mỗi request bị gác (AC-08.12).
    const row = await this.prisma.dashboardUser.findUnique({
      where: { id: sessionUser.id },
      select: { role: true, privileges: true },
    });
    // Tài khoản đã bị xóa nhưng session còn sống ⇒ 403, tuyệt đối không 500 và không cho qua.
    if (!row) throw new ForbiddenException('insufficient privilege');

    // Thiết kế mục 4.2: "admin mặc nhiên có mọi quyền" — nội dung mảng `privileges` bị bỏ qua.
    if (row.role === 'admin') return true;

    const held: readonly string[] = Array.isArray(row.privileges) ? row.privileges : [];
    if (required.some((privilege) => held.includes(privilege))) return true;

    // Thông điệp CỐ Ý khác 'insufficient role' của RolesGuard, để một 403 trong log/QA quy được
    // ngay về đúng guard đã chặn (AC-08.8).
    throw new ForbiddenException('insufficient privilege');
  }
}
