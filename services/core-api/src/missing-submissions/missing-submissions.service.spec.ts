import { Q_OUTBOUND } from '../contracts';
import { MissingSubmissionsService } from './missing-submissions.service';

describe('MissingSubmissionsService.reportNow', () => {
  let prisma: {
    assignmentCalendar: { findUnique: jest.Mock };
    student: { findMany: jest.Mock };
    submission: { findMany: jest.Mock };
    classConfig: { findUnique: jest.Mock };
  };
  let rabbit: { publish: jest.Mock };
  let templates: { render: jest.Mock };
  let service: MissingSubmissionsService;

  beforeEach(() => {
    prisma = {
      assignmentCalendar: { findUnique: jest.fn() },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      submission: { findMany: jest.fn().mockResolvedValue([]) },
      classConfig: { findUnique: jest.fn() },
    };
    rabbit = { publish: jest.fn() };
    templates = { render: jest.fn().mockResolvedValue('Lớp 10A: 2 học viên chưa nộp bài.') };
    service = new MissingSubmissionsService(prisma as never, rabbit as never, templates as never);
  });

  it('does nothing when today has no assignment scheduled', async () => {
    prisma.assignmentCalendar.findUnique.mockResolvedValue(null);
    await service.reportNow();
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(rabbit.publish).not.toHaveBeenCalled();
  });

  it('never targets students or parents — only publishes to the class advisor', async () => {
    prisma.assignmentCalendar.findUnique.mockResolvedValue({ date: new Date(), note: null });
    prisma.student.findMany.mockResolvedValue([
      { id: 1, fullName: 'Học sinh A', className: '10A' },
      { id: 2, fullName: 'Học sinh B', className: '10A' },
    ]);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', advisorZaloId: 'advisor-1', autoSend: false });

    await service.reportNow();

    expect(rabbit.publish).toHaveBeenCalledTimes(1);
    const [routingKey, message] = rabbit.publish.mock.calls[0];
    expect(routingKey).toBe(Q_OUTBOUND);
    expect(message.zaloUserId).toBe('advisor-1');
  });

  it('excludes students who already submitted today', async () => {
    prisma.assignmentCalendar.findUnique.mockResolvedValue({ date: new Date(), note: null });
    prisma.student.findMany.mockResolvedValue([
      { id: 1, fullName: 'Đã nộp', className: '10A' },
      { id: 2, fullName: 'Chưa nộp', className: '10A' },
    ]);
    prisma.submission.findMany.mockResolvedValue([{ studentId: 1 }]);
    prisma.classConfig.findUnique.mockResolvedValue({ className: '10A', advisorZaloId: 'advisor-1' });

    await service.reportNow();

    expect(templates.render).toHaveBeenCalledWith(
      'missing_submission.report',
      'vi',
      expect.objectContaining({ count: '1', names: 'Chưa nộp' }),
    );
  });

  it('skips (with a warning, not a crash) a class with no advisor configured', async () => {
    prisma.assignmentCalendar.findUnique.mockResolvedValue({ date: new Date(), note: null });
    prisma.student.findMany.mockResolvedValue([{ id: 1, fullName: 'A', className: 'Lớp lạ' }]);
    prisma.classConfig.findUnique.mockResolvedValue(null);

    await service.reportNow();

    expect(rabbit.publish).not.toHaveBeenCalled();
  });
});
