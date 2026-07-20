import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DashboardUser } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(email: string, password: string): Promise<DashboardUser | null> {
    const user = await this.prisma.dashboardUser.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }
}
