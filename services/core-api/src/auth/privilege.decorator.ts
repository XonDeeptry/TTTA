import { SetMetadata } from '@nestjs/common';
import type { DashboardPrivilege } from './privileges';

/** Cùng khuôn với `ROLES_KEY` / `Roles` ở roles.decorator.ts (thiết kế mục 4.2 yêu cầu đúng
 * khuôn đó) — một khóa metadata duy nhất, đọc bằng `reflector.getAllAndOverride`. */
export const PRIVILEGES_KEY = 'privileges';

/**
 * Gác một handler (hoặc cả controller) bằng quyền phụ. Nhiều tham số nghĩa là HOẶC — giữ MỘT
 * trong số đó là đủ (AC-08.2).
 *
 * Luôn dùng KÈM `SessionAuthGuard` và ĐẶT SAU nó: `@UseGuards(SessionAuthGuard, PrivilegeGuard)`.
 */
export const RequiresPrivilege = (...privileges: DashboardPrivilege[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PRIVILEGES_KEY, privileges);
