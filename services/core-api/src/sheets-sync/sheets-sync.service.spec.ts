import { SheetRow, SheetsClient } from './sheets-client';
import { SheetsSyncService } from './sheets-sync.service';

describe('SheetsSyncService.syncNow', () => {
  let prisma: {
    course: { findUnique: jest.Mock };
    student: { upsert: jest.Mock };
    sheetSyncLog: { create: jest.Mock };
  };
  let settings: { getRaw: jest.Mock };
  let fakeClient: SheetsClient;
  let clientFactory: jest.Mock;
  let service: SheetsSyncService;

  const validRow: SheetRow = { code: 'HV001', fullName: 'Nguyễn Văn A', phone: '0912345678', courseKey: 'basic' };

  beforeEach(() => {
    prisma = {
      course: { findUnique: jest.fn().mockResolvedValue({ id: 1, key: 'basic' }) },
      student: { upsert: jest.fn().mockResolvedValue(undefined) },
      sheetSyncLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    settings = {
      getRaw: jest.fn((key: string) =>
        Promise.resolve(key === 'sheets.service_account_json' ? '{"fake":true}' : 'sheet-id-123'),
      ),
    };
    fakeClient = { fetchRows: jest.fn().mockResolvedValue([validRow]) };
    clientFactory = jest.fn().mockReturnValue(fakeClient);
    service = new SheetsSyncService(prisma as never, settings as never, clientFactory);
  });

  it('skips the run entirely when Sheets credentials are not configured yet', async () => {
    settings.getRaw.mockResolvedValue(null);
    await service.syncNow();
    expect(clientFactory).not.toHaveBeenCalled();
    expect(prisma.sheetSyncLog.create).not.toHaveBeenCalled();
  });

  it('upserts a valid row and logs rowsOk=1, rowsError=0', async () => {
    await service.syncNow();
    expect(prisma.student.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'HV001' }, create: expect.objectContaining({ courseId: 1 }) }),
    );
    expect(prisma.sheetSyncLog.create).toHaveBeenCalledWith({
      data: { rowsOk: 1, rowsError: 0, errorDetail: undefined },
    });
  });

  it('does not silently swallow a row with an invalid phone number', async () => {
    (fakeClient.fetchRows as jest.Mock).mockResolvedValue([{ ...validRow, phone: 'abc' }]);
    await service.syncNow();
    expect(prisma.student.upsert).not.toHaveBeenCalled();
    expect(prisma.sheetSyncLog.create).toHaveBeenCalledWith({
      data: { rowsOk: 0, rowsError: 1, errorDetail: [{ code: 'HV001', reason: expect.stringContaining('SĐT') }] },
    });
  });

  it('does not silently swallow a row whose course_key is unknown', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    await service.syncNow();
    expect(prisma.student.upsert).not.toHaveBeenCalled();
    expect(prisma.sheetSyncLog.create).toHaveBeenCalledWith({
      data: { rowsOk: 0, rowsError: 1, errorDetail: [{ code: 'HV001', reason: expect.stringContaining('basic') }] },
    });
  });

  it('logs a fetch-level failure instead of throwing', async () => {
    (fakeClient.fetchRows as jest.Mock).mockRejectedValue(new Error('network down'));
    await service.syncNow();
    expect(prisma.sheetSyncLog.create).toHaveBeenCalledWith({
      data: { rowsOk: 0, rowsError: 0, errorDetail: { fetchError: 'network down' } },
    });
  });
});
