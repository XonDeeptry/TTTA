import { NotFoundException } from '@nestjs/common';
import { Q_OUTBOUND } from '../contracts';
import { OnboardingService, normalizeVnPhone } from './onboarding.service';

describe('normalizeVnPhone', () => {
  it.each([
    ['84987654321', '0987654321', 'Zalo trả kèm mã quốc gia'],
    [84987654321, '0987654321', 'Zalo trả kiểu SỐ, không phải chuỗi'],
    ['0987654321', '0987654321', 'đã là dạng nội địa'],
    ['+84 987 654 321', '0987654321', 'có dấu cộng và khoảng trắng'],
    ['987654321', '0987654321', 'thiếu số 0 đầu'],
    [0, null, 'chưa chia sẻ ⇒ Zalo trả 0'],
    ['', null, 'rỗng'],
    [null, null, 'không có trường'],
    [undefined, null, 'không có trường'],
  ])('%p ⇒ %p (%s)', (input, expected, _note) => {
    expect(normalizeVnPhone(input as never)).toBe(expected);
  });
});

describe('OnboardingService', () => {
  let prisma: {
    zaloBinding: { findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    student: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let templates: { render: jest.Mock };
  let redis: {
    addKnownUser: jest.Mock;
    replaceKnownUsers: jest.Mock;
    client: { get: jest.Mock };
  };
  let service: OnboardingService;

  beforeEach(() => {
    prisma = {
      zaloBinding: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      student: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    rabbit = { publish: jest.fn() };
    templates = { render: jest.fn().mockResolvedValue('Tài khoản của Nam đã được kích hoạt.') };
    redis = {
      addKnownUser: jest.fn().mockResolvedValue(undefined),
      replaceKnownUsers: jest.fn().mockResolvedValue(undefined),
      // Mặc định KHÔNG có token ⇒ listPending bỏ qua bước gọi Zalo, trả danh sách thô như cũ.
      client: { get: jest.fn().mockResolvedValue(null) },
    };
    service = new OnboardingService(prisma as never, rabbit as never, templates as never, redis as never);
  });

  /**
   * Danh sách "người đã biết" cho gateway phân biệt học viên với người lạ (hạn mức chống spam).
   * Postgres là nguồn sự thật; Redis chỉ là bản sao đọc và được DỰNG LẠI mỗi lần khởi động,
   * nên không bao giờ trôi khỏi DB.
   */
  describe('mirror danh sách người đã kích hoạt', () => {
    it('khởi động ⇒ dựng lại từ MỌI binding active, đã khử trùng lặp', async () => {
      prisma.zaloBinding.findMany.mockResolvedValue([
        { zaloUserId: 'u1' },
        { zaloUserId: 'u2' },
        { zaloUserId: 'u1' }, // một Zalo nhiều học viên ⇒ trùng id là chuyện BÌNH THƯỜNG
      ]);
      await service.onModuleInit();
      expect(prisma.zaloBinding.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { zaloUserId: true },
      });
      expect(redis.replaceKnownUsers).toHaveBeenCalledWith(['u1', 'u2']);
    });

    it('kích hoạt ⇒ thêm user vào danh sách ngay', async () => {
      prisma.zaloBinding.findUnique.mockResolvedValue({ id: 1, zaloUserId: 'user-9' });
      prisma.student.findFirst.mockResolvedValue({ id: 5, fullName: 'Nam' });
      prisma.zaloBinding.update.mockResolvedValue({ id: 1, status: 'active' });

      await service.activate(1, '0900000000');

      expect(redis.addKnownUser).toHaveBeenCalledWith('user-9');
    });

    it('không có token Zalo ⇒ trả danh sách thô, KHÔNG gọi ra ngoài', async () => {
      prisma.zaloBinding.findMany.mockResolvedValue([{ id: 1, zaloUserId: 'u1', status: 'pending' }]);
      const fetchFn = jest.fn();
      service.fetchFn = fetchFn as never;

      const rows = await service.listPending();

      expect(rows).toEqual([{ id: 1, zaloUserId: 'u1', status: 'pending' }]);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('có token ⇒ làm giàu tên + ảnh + SĐT đã chia sẻ từ hồ sơ Zalo', async () => {
      prisma.zaloBinding.findMany.mockResolvedValue([{ id: 1, zaloUserId: 'u1', status: 'pending' }]);
      redis.client.get.mockResolvedValue('tok');
      service.fetchFn = jest.fn().mockResolvedValue({
        json: async () => ({
          error: 0,
          data: { display_name: 'Sơn Bùi', avatar: 'https://a/x.jpg', shared_info: { phone: 84900000000 } },
        }),
      }) as never;

      const [row] = await service.listPending();

      expect(row.zaloDisplayName).toBe('Sơn Bùi');
      expect(row.zaloAvatar).toBe('https://a/x.jpg');
      // Đã chuẩn hóa về dạng nội địa — đúng dạng `students.phone` để tư vấn đối chiếu được ngay.
      expect(row.zaloSharedPhone).toBe('0900000000');
    });

    it('phone = 0 (chưa chia sẻ) ⇒ null, KHÔNG in ra số 0 cho tư vấn', async () => {
      prisma.zaloBinding.findMany.mockResolvedValue([{ id: 1, zaloUserId: 'u1', status: 'pending' }]);
      redis.client.get.mockResolvedValue('tok');
      service.fetchFn = jest.fn().mockResolvedValue({
        json: async () => ({ error: 0, data: { display_name: 'A', shared_info: { phone: 0 } } }),
      }) as never;

      const [row] = await service.listPending();
      expect(row.zaloSharedPhone).toBeNull();
    });

    it('Zalo lỗi ⇒ vẫn trả danh sách, chỉ thiếu tên (không làm chết màn hình vận hành)', async () => {
      prisma.zaloBinding.findMany.mockResolvedValue([{ id: 1, zaloUserId: 'u1', status: 'pending' }]);
      redis.client.get.mockResolvedValue('tok');
      service.fetchFn = jest.fn().mockRejectedValue(new Error('mạng hỏng')) as never;

      const [row] = await service.listPending();
      expect(row.id).toBe(1);
      expect(row.zaloDisplayName).toBeUndefined();
    });

    it('Redis hỏng KHÔNG được làm hỏng việc kích hoạt (binding đã ghi Postgres xong)', async () => {
      prisma.zaloBinding.findUnique.mockResolvedValue({ id: 1, zaloUserId: 'user-9' });
      prisma.student.findFirst.mockResolvedValue({ id: 5, fullName: 'Nam' });
      const updated = { id: 1, status: 'active' };
      prisma.zaloBinding.update.mockResolvedValue(updated);
      redis.addKnownUser.mockRejectedValue(new Error('redis down'));

      await expect(service.activate(1, '0900000000')).resolves.toBe(updated);
      expect(rabbit.publish).toHaveBeenCalled();
    });
  });

  /**
   * Tự kích hoạt từ SĐT học viên CHỦ ĐỘNG chia sẻ qua Zalo. Bất biến quan trọng nhất: chỉ tự
   * động khi khớp ĐÚNG MỘT học viên. Ghép sai còn tệ hơn để chờ — nhận xét sẽ bay sang nhầm
   * người, và một Zalo dùng chung cho anh chị em là mô hình CÓ THẬT ở đây.
   */
  describe('autoActivateFromSharedPhone', () => {
    function withSharedPhone(phone: unknown): void {
      redis.client.get.mockResolvedValue('tok');
      prisma.zaloBinding.findMany.mockResolvedValue([{ id: 7, zaloUserId: 'u1', status: 'pending' }]);
      service.fetchFn = jest.fn().mockResolvedValue({
        json: async () => ({ error: 0, data: { display_name: 'A', shared_info: { phone } } }),
      }) as never;
    }

    it('khớp ĐÚNG MỘT học viên ⇒ tự kích hoạt', async () => {
      withSharedPhone(84900000000);
      prisma.student.findMany.mockResolvedValue([{ id: 5, code: 'HS1' }]);
      prisma.zaloBinding.findUnique.mockResolvedValue({ id: 7, zaloUserId: 'u1' });
      prisma.student.findFirst.mockResolvedValue({ id: 5, fullName: 'Nam' });
      prisma.zaloBinding.update.mockResolvedValue({ id: 7, status: 'active' });

      await service.autoActivateFromSharedPhone();

      expect(prisma.student.findMany).toHaveBeenCalledWith({ where: { phone: '0900000000' } });
      expect(prisma.zaloBinding.update).toHaveBeenCalled();
    });

    it('khớp NHIỀU học viên (anh chị em chung SĐT) ⇒ KHÔNG tự chọn, để tư vấn xử lý', async () => {
      withSharedPhone(84900000000);
      prisma.student.findMany.mockResolvedValue([{ id: 5 }, { id: 6 }]);

      await service.autoActivateFromSharedPhone();

      expect(prisma.zaloBinding.update).not.toHaveBeenCalled();
    });

    it('SĐT không có trong CRM ⇒ để nguyên chờ', async () => {
      withSharedPhone(84900000000);
      prisma.student.findMany.mockResolvedValue([]);

      await service.autoActivateFromSharedPhone();

      expect(prisma.zaloBinding.update).not.toHaveBeenCalled();
    });

    it('chưa chia sẻ (phone = 0) ⇒ không tra học viên, không kích hoạt', async () => {
      withSharedPhone(0);

      await service.autoActivateFromSharedPhone();

      expect(prisma.student.findMany).not.toHaveBeenCalled();
      expect(prisma.zaloBinding.update).not.toHaveBeenCalled();
    });

    it('chưa có token Zalo ⇒ thoát sớm, không gọi ra ngoài', async () => {
      redis.client.get.mockResolvedValue(null);
      const fetchFn = jest.fn();
      service.fetchFn = fetchFn as never;

      await service.autoActivateFromSharedPhone();

      expect(fetchFn).not.toHaveBeenCalled();
    });
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
