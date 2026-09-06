import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TestUploadService } from './test-upload.service';

// GIỮ NGUYÊN phần còn lại của `fs` — Prisma Client gọi `fs.existsSync` lúc nạp module, thay cả
// module sẽ làm hỏng mọi thứ import PrismaService chứ không chỉ file này.
jest.mock('fs', () => ({
  ...jest.requireActual<object>('fs'),
  promises: { mkdir: jest.fn(), writeFile: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsPromises = (require('fs') as { promises: { mkdir: jest.Mock; writeFile: jest.Mock } }).promises;

/**
 * Lỗi phát hiện 2026-09-06: mọi lần Test Upload đều ghi vào CHUNG thư mục `test-uploads/`, mà
 * grading-worker ghi `audio.mp3` cạnh file nguồn (`extract_audio` dùng `dirname`). Hai người
 * dùng cùng lúc ⇒ ghi đè `audio.mp3` của nhau ⇒ bài này bị chấm bằng tiếng của bài kia.
 * Không có exception, không có log lỗi — chỉ là điểm sai.
 */
describe('TestUploadService.upload — cách ly thư mục', () => {
  let prisma: {
    student: { findUnique: jest.Mock };
    zaloBinding: { findFirst: jest.Mock; create: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let service: TestUploadService;

  const file = { originalname: 'bai-noi.m4a', mimetype: 'audio/mp4', buffer: Buffer.from('x') } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    fsPromises.mkdir.mockResolvedValue(undefined);
    fsPromises.writeFile.mockResolvedValue(undefined);
    prisma = {
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, courseId: 2, fullName: 'Nam', phone: '0900000000' }),
      },
      zaloBinding: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }), // binding giả đã tồn tại
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    rabbit = { publish: jest.fn() };
    service = new TestUploadService(prisma as never, rabbit as never);
  });

  const publishedPath = (): string =>
    (rabbit.publish.mock.calls[0][1] as { mediaPath: string }).mediaPath;

  it('mỗi lần tải lên nằm trong THƯ MỤC RIÊNG theo messageId', async () => {
    const result = await service.upload(1, file);
    expect(publishedPath()).toBe(`test-uploads/${result.messageId}/original.m4a`);
  });

  it('hai lần tải lên KHÔNG dùng chung thư mục (bất biến chống ghi đè audio.mp3)', async () => {
    await service.upload(1, file);
    const first = publishedPath();
    rabbit.publish.mockClear();
    await service.upload(1, file);
    const second = publishedPath();

    const dirOf = (p: string): string => p.slice(0, p.lastIndexOf('/'));
    expect(dirOf(first)).not.toBe(dirOf(second));
  });

  it('tạo thư mục trước khi ghi file', async () => {
    await service.upload(1, file);
    expect(fsPromises.mkdir).toHaveBeenCalledWith(expect.stringContaining('test-uploads'), { recursive: true });
    expect(fsPromises.writeFile).toHaveBeenCalled();
  });

  it('học viên không tồn tại ⇒ 404, không ghi gì ra đĩa', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.upload(99, file)).rejects.toBeInstanceOf(NotFoundException);
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });

  it('học viên chưa gán khóa ⇒ 400 (không có rubric để chấm)', async () => {
    prisma.student.findUnique.mockResolvedValue({ id: 1, courseId: null });
    await expect(service.upload(1, file)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('file không phải audio/video ⇒ 400', async () => {
    const pdf = { originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') } as never;
    await expect(service.upload(1, pdf)).rejects.toBeInstanceOf(BadRequestException);
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });
});
