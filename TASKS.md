# TASKS — Bot chữa bài Zalo OA (ILM)

Bảng theo dõi tiến độ theo lộ trình 5 milestone của [Idea/20260719-KienTrucMicroservices.md](Idea/20260719-KienTrucMicroservices.md) (Phần 4). Cập nhật file này mỗi khi hoàn thành một hạng mục/phase.

**Trạng thái tổng:** M1 hoàn thành ✅ · Đang chờ bắt đầu M2
**Cập nhật lần cuối:** 2026-07-20

---

## Milestone 1 — Hạ tầng + zalo-gateway ✅ (xong 2026-07-20)

- [x] M1.1 Scaffold monorepo: `.gitignore`, `infra/.env.example` (chỉ secrets hạ tầng — cấu hình ứng dụng qua UI dashboard theo v1.2)
- [x] M1.2 `infra/docker-compose.yml` (Postgres 16, Redis 7, RabbitMQ 3 + management UI chỉ bind localhost, Caddy) + `infra/Caddyfile`
- [x] M1.3 zalo-gateway: webhook ACK ngay + verify chữ ký, dedup `message_id` (Redis SETNX, TTL 7 ngày), publish RabbitMQ; topology exchange + queue chính/retry(backoff)/DLQ; ConfigStore đọc `config:*` từ Redis, hot-reload pub/sub, env chỉ là fallback dev
- [x] M1.4 zalo-gateway: outbound consumer — điểm ra duy nhất, guard 48h (chặn + ghi `blocked_48h`, không âm thầm phát sinh phí), gọi Zalo send API, retry khi token hết hạn giữa chừng
- [x] M1.5 zalo-gateway: job refresh token mỗi 50 phút (ghi cặp token atomic), cảnh báo sau 2 lần lỗi liên tiếp
- [x] M1.6 Kiểm chứng: **26/26 unit tests pass**; build tsc sạch; docker compose dựng đủ stack; smoke test e2e: POST webhook → `published`, POST lại → `duplicate`, message nằm trong queue `submissions`, healthz OK
- [x] M1.7 Cập nhật CLAUDE.md: dev commands + layout monorepo
- [ ] M1.8 **(cần chủ dự án)** Tạo app Zalo Developers + liên kết OA, trỏ subdomain về server, lấy cặp token ban đầu → test với OA thật (tiêu chí nghiệm thu M1: nhắn OA → bot phản hồi; token tự làm mới qua đêm)

## Milestone 2 — core-api + dữ liệu ⬜

- [ ] M2.1 Schema Postgres đầy đủ (mục 3.4): `courses`, `criteria`, `students`, `zalo_bindings`, `assignment_calendar`, `submissions`, `gradings`, `flags`, `classes_config`, `settings`, `message_templates`, `outbound_log`, `cost_log`, `sheet_sync_log` + migration
- [ ] M2.2 Bảng `settings` + màn cấu hình: API CRUD, mirror sang Redis `config:*`, publish `config:changed` (hot reload cho gateway/worker)
- [ ] M2.3 Onboarding ChoGan: binding pending khi user lạ, API tư vấn điền SĐT → đối chiếu `students.phone` → kích hoạt + gửi tin template; hỗ trợ 1 Zalo nhiều học viên
- [ ] M2.4 Cron sync Google Sheets → Postgres (15 phút/lần), ghi `sheet_sync_log`, không nuốt lỗi im lặng
- [ ] M2.5 Cron báo chưa nộp cuối ngày (đọc `assignment_calendar`, gửi tư vấn theo lớp — không nhắn học sinh/phụ huynh)
- [ ] M2.6 API nội bộ cho worker (tra binding, lấy rubric, ghi grading/cost) + endpoint retry DLQ + serve media có auth
- [ ] M2.7 Tests + cập nhật docker-compose (thêm core-api, volume `/data/media`) + nghiệm thu: HS mới nhắn → pending → điền SĐT → kích hoạt

## Milestone 3 — grading-worker (Python) ⬜

*Chuẩn bị: cài Python trên máy dev (chưa có).*

- [ ] M3.1 Skeleton worker: consume `submissions`, mirror contracts/topology từ `services/zalo-gateway/src/contracts.ts`
- [ ] M3.2 Tải file Zalo → `/data/media` (quy ước đường dẫn mục 3.8), FFmpeg tách audio từ video, từ chối clip quá dài (van chi phí)
- [ ] M3.3 Lớp provider LLM: adapter Gemini Flash (mặc định) + OpenAI GPT-4o-audio (dự phòng), cấu hình theo khóa từ `courses.llm_config`
- [ ] M3.4 Prompt builder: rubric JSON + schema đầu ra bắt buộc (điểm từng dimension **gồm pronunciation** + từ sai + nhận xét); validate output, retry → DLQ
- [ ] M3.5 Ghi `gradings`/`cost_log` qua core-api; rẽ nhánh `auto_send` vs `awaiting_review`; tin text ngoài luồng nộp → `flags`, KHÔNG trả lời
- [ ] M3.6 Vòng đời media: cron xóa video gốc sau tách audio +7 ngày, audio 90 ngày
- [ ] M3.7 Nghiệm thu: 1 clip thật 5 phút chấm end-to-end theo rubric chuẩn; lỗi LLM vào DLQ và retry được

## Milestone 4 — dashboard (React) ⬜

- [ ] M4.1 Skeleton React + Vite + react-i18next (vi/en), đăng nhập session, 2 vai trò admin/staff
- [ ] M4.2 Phân hệ 1 — Giám sát & Cấu hình hệ thống: queue depth, DLQ + nút Retry, trạng thái token, **màn Cấu hình** (Zalo app/OA, token khởi tạo, khóa LLM, ngưỡng clip, guard 48h — masked, hiệu lực nóng)
- [ ] M4.3 Phân hệ 2 — Học viên: danh sách/tìm kiếm/sửa tay, màn Onboarding (pending bindings), lỗi sync Sheets
- [ ] M4.4 Phân hệ 3 — Bài nộp: bảng trạng thái, player audio (stream có auth), màn Kiểm duyệt (điểm + phát âm, sửa nhận xét, bấm gửi), xóa media
- [ ] M4.5 Phân hệ 4 — Báo cáo & chi phí: tỷ lệ nộp, chi phí LLM theo ngày/tháng, xuất Excel
- [ ] M4.6 Phân hệ 5 — Tiêu chí & Prompt: upload .docx template chuẩn, preview rubric JSON, cấu hình provider/model/temperature/ngôn ngữ theo khóa, `auto_send` theo lớp
- [ ] M4.7 Nghiệm thu: giáo viên duyệt 1 bài trên dashboard → HS nhận nhận xét; 20:30 tư vấn nhận danh sách chưa nộp

## Milestone 5 — Pilot ⬜ (cần chủ dự án vận hành)

- [ ] M5.1 Deploy VPS thật (Ubuntu, đĩa ≥100GB), trỏ domain, IP allowlist Zalo
- [ ] M5.2 Nhập cấu hình qua dashboard, upload rubric thật, sync danh sách HS
- [ ] M5.3 Chạy 1–2 lớp trong 2–4 tuần; kiểm duyệt 100% giai đoạn đầu
- [ ] M5.4 Đo: chi phí LLM/HS/ngày · tỷ lệ giáo viên sửa nhận xét (<5% → bật auto_send theo lớp) · tỷ lệ gán nhầm onboarding · độ lệch chấm phát âm LLM vs giáo viên
- [ ] M5.5 Quyết định mở rộng (hoặc cắm adapter Azure/Speechace cho phát âm nếu không đạt)

---

## Ghi chú vận hành dev

- Chưa commit code milestone nào — chờ chủ dự án yêu cầu.
- Docker Desktop cần chạy trước khi `docker compose up`. Python chưa cài trên máy dev (cần cho M3).
- `infra/.env` local đang là bản copy `.env.example` (dev default, đã gitignore).
