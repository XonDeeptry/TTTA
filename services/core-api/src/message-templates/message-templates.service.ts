import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Fallback khi chưa seed message_templates cho một key/lang — để onboarding/báo cáo
 * không vỡ luồng chỉ vì thiếu nội dung; production nên luôn có bản ghi thật trong DB.
 */
const DEFAULT_TEMPLATES: Record<string, string> = {
  'zalo_binding.activated': 'Tài khoản của {{name}} đã được kích hoạt. Em có thể bắt đầu nộp bài nhé!',
  'missing_submission.report': 'Lớp {{className}}: {{count}} học viên chưa nộp bài hôm nay ({{names}}).',
};

@Injectable()
export class MessageTemplatesService {
  private readonly logger = new Logger(MessageTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async render(key: string, lang: string, vars: Record<string, string> = {}): Promise<string> {
    const template = await this.prisma.messageTemplate.findUnique({ where: { key_lang: { key, lang } } });
    if (!template) {
      this.logger.warn(`Chưa có message_templates cho key="${key}" lang="${lang}" — dùng mặc định`);
    }
    const body = template?.body ?? DEFAULT_TEMPLATES[key] ?? key;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), body);
  }
}
