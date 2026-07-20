import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: {
    setting: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
  };
  let redis: { mirrorConfig: jest.Mock };
  let service: SettingsService;

  beforeEach(() => {
    prisma = {
      setting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    redis = { mirrorConfig: jest.fn().mockResolvedValue(undefined) };
    service = new SettingsService(prisma as never, redis as never);
  });

  it('rejects unknown setting keys', async () => {
    await expect(service.upsert('not.a.real.key', 'x')).rejects.toThrow(BadRequestException);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('rejects a value of the wrong type for the key kind', async () => {
    await expect(service.upsert('limits.outbound_48h_guard', 'not-a-bool')).rejects.toThrow(BadRequestException);
    await expect(service.upsert('limits.max_clip_duration_sec', 'seven')).rejects.toThrow(BadRequestException);
  });

  it('upserts a valid string setting and mirrors the raw value to Redis (no quoting)', async () => {
    await service.upsert('zalo.app_id', 'app-123', 'admin@ilm.edu.vn');
    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'zalo.app_id' },
        create: { key: 'zalo.app_id', value: 'app-123', updatedBy: 'admin@ilm.edu.vn' },
      }),
    );
    expect(redis.mirrorConfig).toHaveBeenCalledWith('zalo.app_id', 'app-123');
  });

  it('mirrors a boolean setting as the string "true"/"false", matching gateway getConfigBool', async () => {
    await service.upsert('limits.outbound_48h_guard', false);
    expect(redis.mirrorConfig).toHaveBeenCalledWith('limits.outbound_48h_guard', 'false');
  });

  it('masks sensitive values in list() but not in getRaw()', async () => {
    prisma.setting.findMany.mockResolvedValue([{ key: 'zalo.app_secret', value: 'supersecretvalue' }]);
    const listed = await service.list();
    const entry = listed.find((s) => s.key === 'zalo.app_secret');
    expect(entry?.value).toBe('••••alue');

    prisma.setting.findUnique.mockResolvedValue({ key: 'zalo.app_secret', value: 'supersecretvalue' });
    await expect(service.getRaw('zalo.app_secret')).resolves.toBe('supersecretvalue');
  });

  it('mirrors every existing setting to Redis once on module init', async () => {
    prisma.setting.findMany.mockResolvedValue([
      { key: 'zalo.app_id', value: 'app-1' },
      { key: 'limits.max_clip_duration_sec', value: 420 },
    ]);
    await service.onModuleInit();
    expect(redis.mirrorConfig).toHaveBeenCalledWith('zalo.app_id', 'app-1');
    expect(redis.mirrorConfig).toHaveBeenCalledWith('limits.max_clip_duration_sec', '420');
  });
});
