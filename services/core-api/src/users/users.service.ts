import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import type { DashboardRole } from '../auth/session.types';
import { CreateUserDto } from './dto/create-user.dto';

/** Cùng giá trị với auth.service.ts / bootstrap-admin.service.ts (NFR-S4). */
const SALT_ROUNDS = 12;

/**
 * Projection duy nhất mà module này trả ra (F5-ba.md §1.0 / NFR-S1).
 * Dùng `select` để `password_hash` KHÔNG BAO GIỜ được nạp vào tiến trình API —
 * chứ không phải nạp cả row rồi xoá field đi.
 */
const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

/** Shape trả về cho dashboard. `createdAt` được JSON hoá thành chuỗi ISO-8601. */
export interface UserView {
  id: number;
  email: string;
  role: DashboardRole;
  mustChangePassword: boolean;
  createdAt: Date;
}

/** Prisma known-request-error được nhận diện theo `code` (duck-typing) để test mock được. */
function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /users — không phân trang (NFR-P1: < 20 dòng thực tế), sắp theo thứ tự tạo. */
  list(): Promise<UserView[]> {
    return this.prisma.dashboardUser.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * POST /users — tạo tài khoản dashboard.
   *
   * Email được lưu ĐÚNG NHƯ ADMIN GÕ (không lowercase, không normalize). Đây là sai
   * lệch có chủ ý so với F5-ba.md BR-3/AC-06: `AuthService.validate` tra cứu
   * `findUnique({ where: { email } })` theo chuỗi thô và đang bị đóng băng (F4), nên nếu
   * hạ chữ thường lúc lưu thì admin gõ "GiaoVien@ilm.local" sẽ tạo ra một tài khoản mà
   * chính địa chỉ vừa phát cho giáo viên lại đăng nhập không được.
   *
   * Bù lại, tính duy nhất được kiểm KHÔNG PHÂN BIỆT HOA THƯỜNG ngay tại đây, nên
   * "GiaoVien@ilm.local" và "giaovien@ilm.local" không thể cùng tồn tại — trả về đúng
   * 409 như trường hợp trùng khít (frontend chỉ đọc HTTP status, F5-ba.md §1.4).
   *
   * Cờ mustChangePassword luôn = true (NFR-S5) để luồng bắt buộc đổi mật khẩu của F4
   * tự động có hiệu lực — F5 không tự dựng cơ chế ép đổi nào cả.
   */
  async create(dto: CreateUserDto): Promise<UserView> {
    const existing = await this.prisma.dashboardUser.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('email already exists');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      return await this.prisma.dashboardUser.create({
        data: {
          email: dto.email,
          passwordHash,
          role: dto.role,
          mustChangePassword: true,
        },
        select: USER_SELECT,
      });
    } catch (err) {
      // Unique index của Postgres mới là nguồn chân lý: kiểm trước ở trên có thể thua
      // một request song song, nên vẫn phải bắt P2002 và map về 409 (NFR-S7).
      if (prismaErrorCode(err) === 'P2002') {
        throw new ConflictException('email already exists');
      }
      throw err;
    }
  }

  /**
   * POST /users/:id/reset-password — admin đặt lại mật khẩu cho NGƯỜI KHÁC.
   *
   * BR-5/NFR-S9: admin không được tự đặt lại mật khẩu của chính mình qua đường này
   * (phải dùng POST /auth/change-password để chứng minh biết mật khẩu cũ). Kiểm tra
   * này chạy TRƯỚC mọi thao tác ghi.
   *
   * BR-6: chỉ ghi đúng hai cột password_hash + must_change_password. Không đụng
   * role/email/id, và cố ý KHÔNG huỷ session đang sống của người bị reset (§2.7) —
   * service này thậm chí không có dependency nào tới Redis/session store.
   */
  async resetPassword(
    targetUserId: number,
    actingAdminId: number,
    newPassword: string,
  ): Promise<UserView> {
    if (targetUserId === actingAdminId) {
      throw new BadRequestException('cannot reset your own password');
    }

    const target = await this.prisma.dashboardUser.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('user not found');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    try {
      return await this.prisma.dashboardUser.update({
        where: { id: targetUserId },
        data: { passwordHash, mustChangePassword: true },
        select: USER_SELECT,
      });
    } catch (err) {
      // Row bị xoá xen giữa lần đọc và lần ghi.
      if (prismaErrorCode(err) === 'P2025') throw new NotFoundException('user not found');
      throw err;
    }
  }
}
