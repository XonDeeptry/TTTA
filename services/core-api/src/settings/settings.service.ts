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

  /**
   * Danh sách model ĐANG khả dụng, hỏi thẳng provider bằng API key đã lưu.
   *
   * Có endpoint này vì một danh sách model hardcode chắc chắn sẽ lỗi thời: ngày 2026-08-25
   * `gemini-2.5-flash` bị Google ngừng cấp cho người dùng mới và mọi lượt chấm trả 404 cho tới khi
   * sửa code rồi deploy lại. Màn Cấu hình dùng kết quả này làm GỢI Ý (datalist) chứ không phải
   * danh sách đóng — vẫn gõ tay được, nên provider đổi đường dẫn/định dạng cũng không khóa người dùng.
   *
   * KHÔNG bao giờ ném lỗi: chưa có key, provider chết, hết hạn mạng… đều trả mảng rỗng kèm `error`
   * để UI hiển thị, vì đây chỉ là tiện ích chọn model chứ không phải đường ghi dữ liệu.
   */
  async listLlmModels(provider: string): Promise<{ provider: string; models: string[]; error?: string }> {
    const known = ['gemini', 'openai'];
    if (!known.includes(provider)) return { provider, models: [], error: 'unknown provider' };

    const apiKey = await this.getRaw(`llm.${provider}_api_key`);
    if (!apiKey) return { provider, models: [], error: 'no api key configured' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      if (provider === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
          { signal: controller.signal },
        );
        if (!res.ok) return { provider, models: [], error: `provider returned ${res.status}` };
        const body = (await res.json()) as { models?: { name?: string }[] };
        // `name` về dạng "models/gemini-3.6-flash" — cắt tiền tố để khớp giá trị mà SDK nhận.
        const models = (body.models ?? [])
          .map((m) => (m.name ?? '').replace(/^models\//, ''))
          .filter(Boolean)
          .sort();
        return { provider, models };
      }

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!res.ok) return { provider, models: [], error: `provider returned ${res.status}` };
      const body = (await res.json()) as { data?: { id?: string }[] };
      const models = (body.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort();
      return { provider, models };
    } catch (err) {
      this.logger.warn(`listLlmModels(${provider}) thất bại: ${(err as Error).message}`);
      return { provider, models: [], error: 'could not reach provider' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async mirror(key: string, value: Prisma.JsonValue): Promise<void> {
    await this.redis.mirrorConfig(key, toRedisString(value));
  }
}
