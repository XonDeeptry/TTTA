import { Injectable, Logger } from '@nestjs/common';
import {
  BUTTON_ACTIONS,
  ILM_PAYLOAD_PREFIX,
  MAX_BUTTONS,
  MAX_BUTTON_PAYLOAD_LEN,
  MAX_BUTTON_TITLE_LEN,
  MAX_OUTBOUND_TEXT_LEN,
  OutboundButton,
  RequestUserInfo,
} from '../contracts';
import { RedisService } from '../redis.service';
import { TokenService } from './token.service';

const SEND_URL = 'https://openapi.zalo.me/v3.0/oa/message/cs';
const ERR_TOKEN_EXPIRED = -216;

/** Giới hạn của template `request_user_info` (tài liệu Zalo). Cắt chứ không từ chối gửi:
 * một tiêu đề dài hơn không đáng làm hỏng cả luồng onboarding của học viên. */
const MAX_REQUEST_INFO_TITLE_LEN = 100;
const MAX_REQUEST_INFO_SUBTITLE_LEN = 500;

/** F11: kiểu nút tư vấn — cú bấm quay lại dưới dạng `user_send_text` mang đúng chuỗi payload. */
const BUTTON_TYPE = 'oa.query.show';
/** F11 (OQ-1): ẩn số duy nhất — payload chỉ-có-buttons có cần `template_type` hay không chỉ
 * chốt được khi bắn thật vào OA thật. Rỗng/chưa đặt = bỏ trường (shape đã xác minh 2026-08-19). */
const TEMPLATE_TYPE_KEY = 'zalo.buttons_template_type';

/**
 * Chia text thành các phần ≤ `max` ký tự để Zalo không từ chối (-210). Cắt ưu tiên ở ranh giới
 * đoạn ("\n\n" — mỗi tiêu chí nhận xét là một đoạn), rồi dòng, cuối cùng mới cắt cứng. Text vừa
 * giới hạn trả nguyên một phần, từng byte như trước.
 */
export function splitOutboundText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = '';
  const push = (piece: string, sep: string): void => {
    if (!current) current = piece;
    else if (current.length + sep.length + piece.length <= max) current += sep + piece;
    else {
      chunks.push(current);
      current = piece;
    }
  };
  for (const para of text.split('\n\n')) {
    if (para.length <= max) {
      push(para, '\n\n');
      continue;
    }
    for (const line of para.split('\n')) {
      for (let i = 0; i < line.length || i === 0; i += max) push(line.slice(i, i + max), '\n');
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

interface ZaloSendResponse {
  error: number;
  message?: string;
}

/** Khối `message.attachment` gửi kèm (F11); undefined = tin text thuần y như trước F11. */
interface ZaloAttachment {
  type: 'template';
  payload: Record<string, unknown>;
}

/** Lỗi tạm (mạng, 5xx) → throw để RabbitService retry; lỗi vĩnh viễn cũng throw sau khi hết cách. */
@Injectable()
export class ZaloApiService {
  private readonly logger = new Logger(ZaloApiService.name);
  fetchFn: typeof fetch = fetch;

  constructor(
    private readonly redis: RedisService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * F11: `buttons` là tham số TÙY CHỌN trên CHÍNH hàm này — cố ý không tách thành hàm gửi thứ
   * hai, để nhánh `-216` (refresh + gửi lại một lần) vẫn là MỘT đường dùng chung cho cả hai biến
   * thể. Attachment được dựng MỘT LẦN trước `trySend` đầu tiên nên lần gửi lại mang y nguyên
   * payload cũ (không hạ cấp khi retry).
   */
  async sendText(zaloUserId: string, text: string, buttons?: OutboundButton[]): Promise<void> {
    const chunks = splitOutboundText(text, MAX_OUTBOUND_TEXT_LEN);
    if (chunks.length > 1) {
      // Pilot 2026-09-15: Zalo TỪ CHỐI (-210) text > 2000 chứ không cắt hộ — tin nhận xét theo từng
      // tiêu chí (2244 ký tự) rơi thẳng vào DLQ. Trước đây ở đây chỉ warn và gửi nguyên văn.
      this.logger.warn(
        `Text dài ${text.length} ký tự > ${MAX_OUTBOUND_TEXT_LEN} — chia thành ${chunks.length} tin: user ${zaloUserId}`,
      );
    }
    const attachment = await this.buildAttachment(zaloUserId, buttons);
    // Nút chỉ gắn vào tin CUỐI — học viên đọc hết nhận xét rồi mới bấm.
    for (let i = 0; i < chunks.length; i++) {
      await this.sendOne(zaloUserId, chunks[i], i === chunks.length - 1 ? attachment : undefined);
    }
  }

  /** Một tin ra Zalo, kèm nhánh `-216` (refresh + gửi lại một lần) dùng chung. */
  private async sendOne(zaloUserId: string, text: string, attachment?: ZaloAttachment): Promise<void> {
    let data = await this.trySend(zaloUserId, text, attachment);
    if (data.error === ERR_TOKEN_EXPIRED) {
      this.logger.warn('Access token hết hạn giữa chừng — refresh và gửi lại một lần');
      const refreshed = await this.tokenService.refreshNow();
      if (!refreshed) throw new Error('Token expired and refresh failed');
      data = await this.trySend(zaloUserId, text, attachment);
    }
    if (data.error !== 0) {
      throw new Error(`Zalo send failed: ${data.error} ${data.message ?? ''}`);
    }
  }

  /**
   * Gửi template xin số điện thoại. Dùng CHUNG `trySend`/nhánh refresh-token với `sendText` —
   * mọi tin ra Zalo phải đi qua đúng một đường, nếu không nhánh `-216` sẽ chỉ được vá ở một chỗ.
   *
   * `text` vẫn gửi kèm để tin có nội dung đọc được nếu client không dựng được template.
   */
  async sendRequestUserInfo(zaloUserId: string, text: string, info: RequestUserInfo): Promise<void> {
    const attachment: ZaloAttachment = {
      type: 'template',
      payload: {
        template_type: 'request_user_info',
        elements: [
          {
            title: info.title.slice(0, MAX_REQUEST_INFO_TITLE_LEN),
            subtitle: info.subtitle.slice(0, MAX_REQUEST_INFO_SUBTITLE_LEN),
            ...(info.imageUrl ? { image_url: info.imageUrl } : {}),
          },
        ],
      },
    };
    let data = await this.trySend(zaloUserId, text, attachment);
    if (data.error === ERR_TOKEN_EXPIRED) {
      this.logger.warn('Access token hết hạn giữa chừng — refresh và gửi lại một lần');
      const refreshed = await this.tokenService.refreshNow();
      if (!refreshed) throw new Error('Token expired and refresh failed');
      data = await this.trySend(zaloUserId, text, attachment);
    }
    if (data.error !== 0) {
      throw new Error(`Zalo request_user_info failed: ${data.error} ${data.message ?? ''}`);
    }
  }

  private async trySend(
    zaloUserId: string,
    text: string,
    attachment?: ZaloAttachment,
  ): Promise<ZaloSendResponse> {
    const token = await this.redis.getAccessToken();
    if (!token) throw new Error('No Zalo access token available');
    const message: Record<string, unknown> = { text };
    if (attachment) message.attachment = attachment;
    const res = await this.fetchFn(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: token },
      body: JSON.stringify({ recipient: { user_id: zaloUserId }, message }),
    });
    return (await res.json()) as ZaloSendResponse;
  }

  /** undefined = không đính kèm gì (đường text thuần không phát sinh thêm một lượt đọc Redis). */
  private async buildAttachment(
    zaloUserId: string,
    buttons?: OutboundButton[],
  ): Promise<ZaloAttachment | undefined> {
    const valid = this.validateButtons(zaloUserId, buttons);
    if (!valid) return undefined;
    const payload: Record<string, unknown> = {
      // `action` là metadata nội bộ của contract — KHÔNG gửi lên Zalo.
      buttons: valid.map((b) => ({ title: b.title, type: BUTTON_TYPE, payload: b.payload })),
    };
    const templateType = await this.readTemplateType();
    if (templateType) payload.template_type = templateType;
    return { type: 'template', payload };
  }

  /**
   * Tất-cả-hoặc-không: bất kỳ vi phạm giới hạn/hình dạng nào cũng bỏ TOÀN BỘ khối nút và gửi
   * text thuần (không bao giờ cắt tiêu đề/payload — cắt payload là đổi nghĩa của nó).
   */
  private validateButtons(zaloUserId: string, buttons?: OutboundButton[]): OutboundButton[] | null {
    if (!Array.isArray(buttons) || buttons.length === 0) return null;
    const drop = (reason: string): null => {
      this.logger.warn(`Bỏ khối nút (${reason}) — gửi text thuần: user ${zaloUserId}`);
      return null;
    };
    if (buttons.length > MAX_BUTTONS) return drop(`count=${buttons.length} > ${MAX_BUTTONS}`);
    for (const b of buttons) {
      if (typeof b?.title !== 'string' || b.title.trim() === '') return drop('title rỗng/sai kiểu');
      if (b.title.length > MAX_BUTTON_TITLE_LEN) return drop(`title=${b.title.length} > ${MAX_BUTTON_TITLE_LEN}`);
      if (typeof b.payload !== 'string' || !b.payload.startsWith(ILM_PAYLOAD_PREFIX)) {
        return drop(`payload không bắt đầu bằng ${ILM_PAYLOAD_PREFIX}`);
      }
      if (b.payload.length > MAX_BUTTON_PAYLOAD_LEN) {
        return drop(`payload=${b.payload.length} > ${MAX_BUTTON_PAYLOAD_LEN}`);
      }
      if (!BUTTON_ACTIONS.includes(b.action)) return drop(`action lạ`);
    }
    return buttons;
  }

  /** Redis hỏng không được làm hỏng việc gửi — hạ cấp về "bỏ template_type" kèm một warn. */
  private async readTemplateType(): Promise<string | null> {
    try {
      return await this.redis.getConfig(TEMPLATE_TYPE_KEY);
    } catch (e) {
      this.logger.warn(`Không đọc được ${TEMPLATE_TYPE_KEY} (${e}) — bỏ qua template_type`);
      return null;
    }
  }
}
