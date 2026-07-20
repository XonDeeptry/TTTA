import { NotFoundException } from '@nestjs/common';
import { Q_OUTBOUND } from '../contracts';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  let prisma: {
    zaloBinding: { findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    student: { findFirst: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let templates: { render: jest.Mock };
  let service: OnboardingService;

  beforeEach(() => {
    prisma = {
      zaloBinding: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      student: { findFirst: jest.fn() },
    };
    rabbit = { publish: jest.fn() };
    templates = { render: jest.fn().mockResolvedValue('Tài khoản của Nam đã được kích hoạt.') };
    service = new OnboardingService(prisma as never, rabbit as never, templates as never);
  });

  describe('ensureBinding', () => {
    it('creates a pending binding when the zalo user has none yet', async () => {
      prisma.zaloBinding.findMany.mockResolvedValue([]);
      const created = { id: 1, zaloUserId: 'user-1', status: 'pending' };
      prisma.zaloBinding.create.mockResolvedValue(created);

      const result = await service.ensureBinding('user-1', 'Nam');

      expect(prisma.zaloBinding.create).toHaveBeenCalledWith({
        data: { zaloUserId: 'user-1', displayName: 'Nam', status: 'pending' },
      });
      expect(result).toEqual([created]);
    });

    it('returns existing bindings unchanged (supports one Zalo, many students)', async () => {
      const existing = [
        { id: 1, zaloUserId: 'user-1', status: 'active' },
        { id: 2, zaloUserId: 'user-1', status: 'pending' },
      ];
      prisma.zaloBinding.findMany.mockResolvedValue(existing);

      const result = await service.ensureBinding('user-1');

      expect(prisma.zaloBinding.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });
  });

  describe('activate', () => {
    it('throws when the binding does not exist', async () => {
      prisma.zaloBinding.findUnique.mockResolvedValue(null);
      await expect(service.activate(99, '0900000000')).rejects.toThrow(NotFoundException);
    });

    it('throws when no student matches the phone number', async () => {
      prisma.zaloBinding.findUnique.mockResolvedValue({ id: 1, zaloUserId: 'user-1' });
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(service.activate(1, '0900000000')).rejects.toThrow(NotFoundException);
    });

    it('activates the binding and publishes the confirmation message to outbound', async () => {
      prisma.zaloBinding.findUnique.mockResolvedValue({ id: 1, zaloUserId: 'user-1' });
      prisma.student.findFirst.mockResolvedValue({ id: 10, fullName: 'Nam', phone: '0900000000' });
      const updated = { id: 1, zaloUserId: 'user-1', studentId: 10, status: 'active' };
      prisma.zaloBinding.update.mockResolvedValue(updated);

      const result = await service.activate(1, '0900000000');

      expect(prisma.zaloBinding.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { studentId: 10, phoneEntered: '0900000000', status: 'active' },
      });
      expect(templates.render).toHaveBeenCalledWith('zalo_binding.activated', 'vi', { name: 'Nam' });
      expect(rabbit.publish).toHaveBeenCalledWith(Q_OUTBOUND, {
        v: 1,
        zaloUserId: 'user-1',
        templateKey: 'zalo_binding.activated',
        text: 'Tài khoản của Nam đã được kích hoạt.',
      });
      expect(result).toEqual(updated);
    });
  });
});
