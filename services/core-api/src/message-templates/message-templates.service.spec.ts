import { MessageTemplatesService } from './message-templates.service';

describe('MessageTemplatesService.render', () => {
  let prisma: { messageTemplate: { findUnique: jest.Mock } };
  let service: MessageTemplatesService;

  beforeEach(() => {
    prisma = { messageTemplate: { findUnique: jest.fn() } };
    service = new MessageTemplatesService(prisma as never);
  });

  it('substitutes {{vars}} from a stored template', async () => {
    prisma.messageTemplate.findUnique.mockResolvedValue({ key: 'x', lang: 'vi', body: 'Xin chào {{name}}!' });
    await expect(service.render('x', 'vi', { name: 'Nam' })).resolves.toBe('Xin chào Nam!');
    expect(prisma.messageTemplate.findUnique).toHaveBeenCalledWith({ where: { key_lang: { key: 'x', lang: 'vi' } } });
  });

  it('falls back to a built-in default when no template row exists yet', async () => {
    prisma.messageTemplate.findUnique.mockResolvedValue(null);
    const text = await service.render('zalo_binding.activated', 'vi', { name: 'Nam' });
    expect(text).toContain('Nam');
  });

  it('falls back to the raw key when neither a template nor a default exists', async () => {
    prisma.messageTemplate.findUnique.mockResolvedValue(null);
    await expect(service.render('unknown.key', 'vi')).resolves.toBe('unknown.key');
  });
});
