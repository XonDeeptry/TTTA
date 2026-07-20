import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { findSettingDef, SETTING_DEFS } from './setting-defs';

export interface SettingView {
  key: string;
  kind: string;
  masked: boolean;
  value: string | number | boolean | null;
}

function toRedisString(value: Prisma.JsonValue): string {
  return typeof value === 'string' ? value : String(value);
}

function maskValue(value: Prisma.JsonValue): string {
  const s = toRedisString(value);
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

function coerce(kind: 'string' | 'boolean' | 'number', value: unknown): string | number | boolean {
  if (kind === 'string') {
    if (typeof value !== 'string') throw new BadRequestException('expected string value');
    return value;
  }
  if (kind === 'boolean') {
    if (typeof value !== 'boolean') throw new BadRequestException('expected boolean value');
    return value;
  }
  if (typeof value !== 'number') throw new BadRequestException('expected number value');
  return value;
}

/**
 * Nguồn sự thật `settings` (Postgres) + mirror sang Redis config:{key} với hot-reload
 * pub/sub (mục 3.3 v1.2) — zalo-gateway (đã có) và grading-worker (M3) đọc từ Redis.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    const all = await this.prisma.setting.findMany();
    for (const s of all) await this.mirror(s.key, s.value);
    this.logger.log(`Mirrored ${all.length} settings sang Redis lúc khởi động`);
  }

  async list(): Promise<SettingView[]> {
    const rows = await this.prisma.setting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return SETTING_DEFS.map((def) => {
      const raw = byKey.get(def.key);
      if (raw === undefined) return { key: def.key, kind: def.kind, masked: def.masked, value: null };
      const value = def.masked ? maskValue(raw) : (raw as string | number | boolean);
      return { key: def.key, kind: def.kind, masked: def.masked, value };
    });
  }

  async upsert(key: string, rawValue: unknown, updatedBy?: string): Promise<{ key: string; ok: true }> {
    const def = findSettingDef(key);
    if (!def) throw new BadRequestException(`Unknown setting key: ${key}`);
    const value = coerce(def.kind, rawValue);
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value, updatedBy },
      update: { value, updatedBy },
    });
    await this.mirror(key, value);
    return { key, ok: true };
  }

  /** Đọc giá trị THẬT (không mask) — dùng nội bộ (InternalTokenGuard, Sheets sync…). */
  async getRaw(key: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return null;
    return toRedisString(row.value);
  }

  private async mirror(key: string, value: Prisma.JsonValue): Promise<void> {
    await this.redis.mirrorConfig(key, toRedisString(value));
  }
}
