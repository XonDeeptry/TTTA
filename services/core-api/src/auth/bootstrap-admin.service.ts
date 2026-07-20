import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';

const SALT_ROUNDS = 12;

/**
 * Dev/first-boot fallback: nếu dashboard_users còn trống và có sẵn
 * CORE_API_BOOTSTRAP_ADMIN_EMAIL/_PASSWORD trong env, tạo tài khoản admin đầu tiên.
 * Không có UI đăng ký — đây là cách duy nhất để có tài khoản admin ban đầu.
 */
@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = process.env.CORE_API_BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.CORE_API_BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;

    const count = await this.prisma.dashboardUser.count();
    if (count > 0) return;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.prisma.dashboardUser.create({ data: { email, passwordHash, role: 'admin' } });
    this.logger.log(`Bootstrap admin created: ${email}`);
  }
}
