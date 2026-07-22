import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  ExecutionContext,
  ForbiddenException,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import '../auth/session.types';

type SessionUser = { id: number; email: string; role: 'admin' | 'staff'; mustChangePassword: boolean };

function requestWithSession(user?: SessionUser): Request {
  return { session: { user } } as unknown as Request;
}

/** ExecutionContext giả, đủ để guard đọc metadata của UsersController + session. */
function contextFor(handlerName: 'list' | 'create' | 'resetPassword', user?: SessionUser): ExecutionContext {
  const handler = (UsersController.prototype as unknown as Record<string, () => unknown>)[handlerName];
  return {
    getClass: () => UsersController,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => requestWithSession(user) }),
  } as unknown as ExecutionContext;
}

const HANDLERS = ['list', 'create', 'resetPassword'] as const;

describe('UsersController metadata', () => {
  // AC-03 / NFR-S2
  it('declares SessionAuthGuard + RolesGuard and @Roles("admin") at the class level', () => {
    const guards = Reflect.getMetadata('__guards__', UsersController) as unknown[];
    expect(guards).toContain(SessionAuthGuard);
    expect(guards).toContain(RolesGuard);
    expect(guards.indexOf(SessionAuthGuard)).toBeLessThan(guards.indexOf(RolesGuard));
    expect(Reflect.getMetadata(ROLES_KEY, UsersController)).toEqual(['admin']);
    expect(Reflect.getMetadata('path', UsersController)).toBe('users');
  });

  // AC-03: không handler nào được nới lỏng bộ guard của class
  it('has no per-handler guard or roles metadata that widens access', () => {
    for (const name of HANDLERS) {
      const handler = (UsersController.prototype as unknown as Record<string, () => unknown>)[name];
      expect(Reflect.getMetadata('__guards__', handler)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
  });

  // AC-17 / NFR-S10
  it('registers exactly three routes and no destructive verb', () => {
    const routes = Object.getOwnPropertyNames(UsersController.prototype)
      .filter((n) => n !== 'constructor')
      .map((name) => {
        const handler = (UsersController.prototype as unknown as Record<string, () => unknown>)[name];
        return {
          name,
          path: Reflect.getMetadata('path', handler) as string,
          method: Reflect.getMetadata('method', handler) as RequestMethod,
        };
      });

    expect(routes).toEqual([
      { name: 'list', path: '/', method: RequestMethod.GET },
      { name: 'create', path: '/', method: RequestMethod.POST },
      { name: 'resetPassword', path: ':id/reset-password', method: RequestMethod.POST },
    ]);
    for (const route of routes) {
      expect([RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.PATCH]).not.toContain(route.method);
    }
  });

  // AC-17 (nguồn): không có decorator @Delete/@Put/@Patch nào trong cả module
  it('contains no @Delete / @Put / @Patch decorator anywhere in src/users', () => {
    for (const [, source] of sourceFiles()) {
      expect(source).not.toMatch(/@(Delete|Put|Patch)\s*\(/);
    }
  });

  // AC-18 / NFR-S3: không log mật khẩu / hash / body
  it('never logs anything: no console/Logger calls in the module, no request logger in main.ts', () => {
    for (const [file, source] of sourceFiles()) {
      const offending = source.split('\n').filter((line) => /console\.|Logger|logger\./.test(line));
      expect(`${file} -> ${offending.join(' | ')}`).toBe(`${file} -> `);
    }
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).not.toMatch(/morgan|useGlobalInterceptors|LoggingInterceptor|LoggerMiddleware/);
  });
});

/** Mọi file nguồn (không tính spec) của module users. */
function sourceFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        out.push([full, readFileSync(full, 'utf8')]);
      }
    }
  };
  walk(__dirname);
  return out;
}

describe('UsersController guard behavior', () => {
  const sessionGuard = new SessionAuthGuard();
  const rolesGuard = new RolesGuard(new Reflector());

  // AC-20
  it('rejects an anonymous request with 401 login required on every route', () => {
    for (const name of HANDLERS) {
      expect(() => sessionGuard.canActivate(contextFor(name))).toThrow(UnauthorizedException);
      expect(() => sessionGuard.canActivate(contextFor(name))).toThrow('login required');
    }
  });

  // AC-19
  it('rejects a staff session with 403 insufficient role on every route', () => {
    const staff: SessionUser = { id: 5, email: 'staff@ilm.local', role: 'staff', mustChangePassword: false };
    for (const name of HANDLERS) {
      expect(sessionGuard.canActivate(contextFor(name, staff))).toBe(true);
      expect(() => rolesGuard.canActivate(contextFor(name, staff))).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(contextFor(name, staff))).toThrow('insufficient role');
    }
  });

  it('lets an admin session through on every route', () => {
    const admin: SessionUser = { id: 1, email: 'admin@ilm.local', role: 'admin', mustChangePassword: false };
    for (const name of HANDLERS) {
      expect(sessionGuard.canActivate(contextFor(name, admin))).toBe(true);
      expect(rolesGuard.canActivate(contextFor(name, admin))).toBe(true);
    }
  });
});

describe('UsersController handlers', () => {
  let users: { list: jest.Mock; create: jest.Mock; resetPassword: jest.Mock };
  let controller: UsersController;
  const admin: SessionUser = { id: 1, email: 'admin@ilm.local', role: 'admin', mustChangePassword: false };

  beforeEach(() => {
    users = { list: jest.fn(), create: jest.fn(), resetPassword: jest.fn() };
    controller = new UsersController(users as unknown as UsersService);
  });

  it('delegates list and create straight to the service', async () => {
    users.list.mockResolvedValue([]);
    users.create.mockResolvedValue({ id: 2 });
    const body = { email: 'teacher@ilm.local', role: 'staff', password: 'initial-pass-1' } as CreateUserDto;

    await expect(controller.list()).resolves.toEqual([]);
    await expect(controller.create(body)).resolves.toEqual({ id: 2 });
    expect(users.create).toHaveBeenCalledWith(body);
  });

  // AC-15 (tầng controller): id của admin đang thao tác lấy từ session, không từ body
  it('passes the acting admin session id into resetPassword', async () => {
    users.resetPassword.mockResolvedValue({ id: 2 });
    const body = { newPassword: 'brand-new-pass-9' } as ResetPasswordDto;

    await controller.resetPassword(2, body, requestWithSession(admin));

    expect(users.resetPassword).toHaveBeenCalledWith(2, 1, 'brand-new-pass-9');
  });

  it('throws 401 when the session user is missing (defensive layer behind the guard)', () => {
    const body = { newPassword: 'brand-new-pass-9' } as ResetPasswordDto;
    expect(() => controller.resetPassword(2, body, requestWithSession())).toThrow(UnauthorizedException);
    expect(users.resetPassword).not.toHaveBeenCalled();
  });
});
