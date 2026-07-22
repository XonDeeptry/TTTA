import { EventsController } from './events.controller';

describe('EventsController', () => {
  it('GET /events/submissions delegates to EventsService.stream with the raw req/res (AC-8/AC-9)', () => {
    const events = { stream: jest.fn() };
    const controller = new EventsController(events as never);
    const req = { session: { user: { id: 1, role: 'staff' } } };
    const res = { setHeader: jest.fn() };

    const returned = controller.submissions(req as never, res as never);

    // Không trả về giá trị (dùng @Res() thô, không qua JSON serializer).
    expect(returned).toBeUndefined();
    expect(events.stream).toHaveBeenCalledTimes(1);
    expect(events.stream).toHaveBeenCalledWith(req, res);
  });
});
