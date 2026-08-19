# Chấm điểm Rubric v2 & Trình soạn tiêu chí cho giáo viên

**Ngày:** 2026-08-19 · **Phiên bản:** 1.0 · **Trạng thái:** Chờ duyệt — chưa triển khai

**Quan hệ với các tài liệu khác:** tài liệu này **bổ sung chi tiết cho mục 3.9 (chuẩn hóa rubric) và mục 3.10 (chấm phát âm bắt buộc)** của `20260719-KienTrucMicroservices.md`, không thay thế nó. Thứ tự ưu tiên kiến trúc giữ nguyên: `20260719-KienTrucMicroservices.md` > `UpdateFoundation.md` > `Foundation.md`. `Foundation.md` vẫn là chuẩn cho phạm vi sản phẩm và ranh giới nghiệp vụ. Khi tài liệu này được duyệt và build xong, tài liệu kiến trúc cần một mục **changelog v1.6** ghi lại 4 quyết định ở Phần 9.

**Nguồn gốc:** hai file rubric thật của trung tâm, đặt tại `Criteria-Source/` (`RubricSpeakingA0-C.pdf`, `Analystic-ScoringBand.pdf`). Đây là lần đầu có rubric thật để đối chiếu — mô hình rubric hiện tại (mục 3.9) được thiết kế khi **chưa có** file mẫu nào tồn tại, nên nó không biểu diễn được cả hai file này.

---

## Phần 1 — Phân tích hai file nguồn

### 1.1. `RubricSpeakingA0-C.pdf` — Cambridge Young Learners (lớp KID)

Gồm **ba bảng khác nhau**, không phải một:

**Bảng A — thang điểm chấm (phần dùng để chấm máy).** 5 tiêu chí × thang **0–5 điểm**:

| # | Tiêu chí | Band 0 | Band 5 |
| :---- | :---- | :---- | :---- |
| 1 | Pronunciation (Âm chính) | Không phát âm được, khó hiểu. | Phát âm rõ ràng, dễ hiểu, gần chuẩn người bản ngữ. |
| 2 | Intonation (Ngữ điệu) | Không có ngữ điệu, đều giọng. | Ngữ điệu tự nhiên, biểu cảm tốt, hỗ trợ truyền đạt ý nghĩa. |
| 3 | Ending sounds (Âm đuôi) | Luôn bỏ âm cuối. | Phát âm hầu hết âm cuối chuẩn xác, rõ ràng. |
| 4 | Word Stress (Trọng âm từ/cụm) | Không có trọng âm, đọc đều từng âm tiết. | Trọng âm chuẩn xác, tự nhiên cả ở từ và cụm. |
| 5 | Fluency (Trôi chảy) | Không nói được / im lặng. | Nói mượt mà, tự nhiên, có thể diễn đạt ý phức đơn giản. |

**Cách tính (trích nguyên văn):** mỗi tiêu chí 0–5 điểm · **tổng tối đa = 25 điểm** · quy đổi ra cấp độ:

| Tổng điểm | Cấp độ | Tên lớp |
| :---- | :---- | :---- |
| 0–10 | Pre-starter (A0) | Tiny Rabbit |
| 11–15 | Starter (A1-) | Little Fox |
| 16–20 | Mover (A1) | Junior Panda |
| 21–25 | Flyer (A2) | Great Big Dino |

**Bảng B — hồ sơ mô tả theo cấp độ.** Cùng 5 tiêu chí nhưng theo trục A0 / A1- / A1 / A2, và một bảng thứ hai cho Pre-B1 / B1 / B2 / C. Đây là **tài liệu tham chiếu cho giáo viên**, không phải thang chấm (không có điểm số) — nhưng rất có giá trị khi đưa vào prompt làm ngữ cảnh cấp độ.

**Bảng C — ngân hàng nhận xét mẫu ("CMT LỚP KIDS-TEEN").** Các câu mẫu được nhóm **theo tiêu chí** (NGỮ ĐIỆU / ÂM ĐUÔI / PRONUNCIATION) **và theo ý định** (KHEN / góp ý), có chỗ trống `….` để điền tên học sinh và từ cụ thể. Đây chính là văn phong mà AI phải bắt chước.

### 1.2. `Analystic-ScoringBand.pdf` — IELTS Speaking

4 tiêu chí × thang **band 0–9**: Fluency and coherence · Lexical resources · Grammatical range and accuracy · Pronunciation.

Khác biệt cấu trúc so với bảng KID:

1. **Cách tính là trung bình, không phải tổng** — trích: "điểm từng phần chiếm 25% trong số điểm tổng của bài thi", và "điểm của từng tiêu chí này sẽ **không có số lẻ** như 4.5, 5.5 hay 6.5".
2. **Mô tả mỗi band là một danh sách gạch đầu dòng**, không phải một câu. Ví dụ band 9 của Fluency có 4 gạch đầu dòng riêng biệt.
3. **Mỗi tiêu chí còn tách thành các yếu tố con** kèm lưới từ khóa theo band. Ví dụ Fluency & coherence tách thành: độ dài/tốc độ/tính liên tục · độ ngập ngừng · độ lặp và tự sửa lỗi · sử dụng phép nối · độ mạch lạc — mỗi yếu tố có từ khóa riêng cho band 4/5/6/7/8 (`Speak slowly`, `Willing to speak at length`, `Speak fluently`…). Đây là **phần có tín hiệu cao nhất để đưa vào prompt LLM**, vì nó nói rõ ranh giới giữa các band.
4. **Bảng chấm cuối cùng yêu cầu hai đầu ra cho mỗi tiêu chí**: "Nhận xét" **và** "Hướng sửa bài" — hiện hệ thống chỉ sinh một.

---

## Phần 2 — Khoảng trống so với mô hình hiện tại

Mô hình rubric hiện tại (`services/core-api/src/criteria/docx-parser.ts`, interface `RubricJson`):

```ts
{ course_key, task_type, band_scale: [min, max], feedback_language, tone,
  dimensions: [{ name, weight, bands: Record<string, string> }],
  few_shot_examples: string[] }
```

| Nhu cầu từ file nguồn | Hiện tại | Khoảng trống |
| :---- | :---- | :---- |
| Tổng (KID) vs. trung bình (IELTS) | — | **Không có khái niệm quy tắc tổng hợp điểm nào cả** |
| Quy đổi tổng điểm → cấp độ | — | Thiếu hoàn toàn |
| Mô tả band nhiều gạch đầu dòng | một chuỗi nối bằng `;` | `;` chính là ký tự phân tách band trong parser — gạch đầu dòng đụng cú pháp |
| Lưới yếu tố con theo band | — | Thiếu hoàn toàn |
| `comment` + `fix` cho mỗi tiêu chí | chỉ `comment` (`grading/schema.py`) | Thiếu trường "hướng sửa bài" |
| Ngân hàng nhận xét theo tiêu chí/ý định | mảng chuỗi phẳng | Mất hết cấu trúc nhóm |
| Nhãn tiếng Việt tách khỏi khóa máy | chỉ có `name`, regex `[a-zA-Z_]+` | Không nhập được nhãn tiếng Việt |

**Hai phát hiện thêm trong lúc rà soát code:**

1. **`weight` hiện là trang trí — không dòng code nào đọc nó để tính điểm.** `reports/reports.service.ts` (hàm `scorePctForGrading`) tính **trung bình không trọng số** rồi chia `band_max`; `grading/prompt.py` chỉ *in* trọng số ra cho LLM đọc. Nghĩa là **báo cáo đang sai âm thầm với bất kỳ rubric nào có trọng số không đều**. Đây là bug có sẵn, không phải do thay đổi này sinh ra, nhưng sẽ được sửa cùng lúc.
2. **Giáo viên không soạn được tiêu chí trên giao diện.** Đường duy nhất là upload `.docx` đúng mini-format ở changelog v1.5 mục 2. Màn `pages/Criteria.tsx` chỉ có form upload + khung `<pre>` xem JSON thô.

---

## Phần 3 — Rubric schema v2

Vẫn lưu trong cột `criteria.rubric` (kiểu `Json`) — **không cần migration cột**.

```jsonc
{
  "schema_version": 2,
  "course_key": "KID-A0A2",
  "task_type": "speaking_clip",
  "tone": "khích lệ",
  "feedback_language": "vi",

  "scale": { "min": 0, "max": 5, "step": 1 },
  "aggregation": { "method": "sum", "round": "none" },   // sum | average | weighted_average
  "levels": [                                             // tùy chọn; bỏ trống → không quy đổi cấp độ
    { "min": 0,  "max": 10, "code": "A0",  "label": "Pre-starter (A0) ~ Tiny Rabbit" },
    { "min": 11, "max": 15, "code": "A1-", "label": "Starter (A1-) ~ Little Fox" },
    { "min": 16, "max": 20, "code": "A1",  "label": "Mover (A1) ~ Junior Panda" },
    { "min": 21, "max": 25, "code": "A2",  "label": "Flyer (A2) ~ Great Big Dino" }
  ],
  "output_fields": ["comment", "fix"],                    // đầu ra LLM cho MỖI tiêu chí

  "dimensions": [{
    "key": "pronunciation",                               // khóa máy, snake_case, ổn định
    "label": "Pronunciation (Âm chính)",                  // nhãn giáo viên thấy
    "weight": 1,
    "bands": {
      "0": ["Không phát âm được, khó hiểu."],
      "5": ["Phát âm rõ ràng, dễ hiểu, gần chuẩn người bản ngữ."]
    },
    "sub_factors": [{
      "label": "Phạm vi sử dụng các thành tố phát âm",
      "by_band": { "4": "Limited range", "6": "A range", "8": "A wide range", "9": "A full range" }
    }]
  }],

  "comment_bank": [
    { "dimension": "intonation", "intent": "góp ý", "text": "Cô nhận bài của bạn…" }
  ],

  "student_reply": {                                      // theo từng khóa, admin định nghĩa
    "show_total": true,
    "show_level": true,
    "template": "Tổng: {total}/{max} — {level}",
    "buttons": [
      { "title": "Em đã xem", "action": "ack" },
      { "title": "Nhờ cô giải thích thêm", "action": "request_advisor" }
    ]
  }
}
```

**Tương thích ngược.** Rubric v1 không có `schema_version`. Một hàm thuần `normalizeRubric()` nâng v1 → v2 **trong bộ nhớ lúc đọc**, không đụng dữ liệu đã lưu:

| v1 | → v2 |
| :---- | :---- |
| `band_scale: [min, max]` | `scale: { min, max, step: 1 }` |
| `name` | `key` **và** `label` (cùng giá trị) |
| `bands: { "0": "mô tả" }` | `bands: { "0": ["mô tả"] }` |
| `few_shot_examples: [...]` | `comment_bank: [{ dimension: null, intent: null, text }]` |
| *(không có)* | `aggregation.method = "average"` — giữ đúng hành vi báo cáo hiện tại |
| *(không có)* | `levels: []`, `output_fields: ["comment"]` |

**Cảnh báo trùng lặp:** theo quy ước đã có của repo (contracts bị nhân ba vì không có cơ chế package dùng chung giữa TS và Python), hàm này phải tồn tại **hai bản, giữ giống hệt nhau**:
`services/core-api/src/criteria/rubric-schema.ts` và
`services/grading-worker/src/grading_worker/grading/rubric_schema.py`.

---

## Phần 4 — Mẫu tiêu chí (template) & phân quyền

**Quyết định của chủ dự án:** không hardcode sẵn hai rubric trên vào code. Thay vào đó **admin (hoặc người được cấp quyền) định nghĩa trước bộ khung, giáo viên khác điền nội dung vào.**

**Bảng mới `RubricTemplate`** — lưu một rubric v2 với phần mô tả để trống, kèm danh sách `locked` liệt kê những gì giáo viên **không** được sửa (mặc định: `dimensions[].key`, `scale`, `aggregation`, `levels`, `output_fields`).

**Phân quyền:** `DashboardUser.privileges String[] @default([])`.

- Vẫn giữ **2 role cũ** `admin` | `staff` — **không** thêm role thứ ba (tránh migration enum + rà lại mọi `@Roles()` đang có).
- `admin` mặc nhiên có mọi quyền.
- `staff` được cấp `"rubric_template"` thì soạn/sửa được template.
- Thực thi bằng `PrivilegeGuard` + decorator `@RequiresPrivilege('rubric_template')`, dựng theo đúng khuôn `RolesGuard` / `@Roles` đã có trong `auth/`.
- Cấp quyền bằng checkbox trên màn Người dùng đã có sẵn.

---

## Phần 5 — Tính điểm: một chỗ duy nhất, phía server

**LLM không bao giờ được yêu cầu cộng điểm.** Nó chỉ chấm từng tiêu chí; tổng và cấp độ do core-api tính.

File mới `services/core-api/src/lib/rubric-scoring.ts`:

```ts
computeTotal(rubric, scores): { total: number; max: number; level: RubricLevel | null }
```

Gọi từ `worker-api.controller.ts` ngay khi tạo grading (chỗ đó **đã** load sẵn `criteria`), nên chỉ có **một** bản cài đặt và grading-worker không cần biết gì về việc tính tổng.

**Lưu vào DB:** `Grading.totalScore` · `Grading.levelCode` · `Grading.levelLabel`.
`reports.service.ts` bỏ hàm trung bình tự chế, gọi chung `computeTotal` — **đồng thời sửa luôn bug `weight` bị bỏ qua ở Phần 2**.
`Student.currentLevelCode` / `currentLevelAt` cập nhật sau mỗi lần chấm — đây chính là đường ánh xạ **Zalo user → học sinh → cấp độ** mà chủ dự án yêu cầu.

---

## Phần 6 — Tin nhắn Zalo có nút bấm

> **Điểm cần chủ dự án xác nhận lại khi duyệt.** Việc thêm nút bấm **chạm vào ranh giới cứng** của `Foundation.md` (mục "bot KHÔNG hội thoại với học sinh", đã được siết thêm ở changelog v1.1 mục 1). Chủ dự án đã được nêu rõ điều này trong lúc lập kế hoạch và vẫn chọn làm.
> **Cách thiết kế để giữ ranh giới ở mức tối đa:** tập nút là **tập đóng** — gateway chỉ định tuyến những payload mang tiền tố `#ilm:` vào một danh sách hành động cố định; **mọi tin nhắn text khác của học sinh vẫn đi nguyên vào luồng flag cho tư vấn như cũ**. Bot không bao giờ tự sinh câu trả lời tự do.

**Đã xác minh với tài liệu trực tuyến ngày 2026-08-19** (theo đúng tiền lệ changelog v1.4 mục 2 — SDK/API ngoài có thể đã đổi so với kiến thức nền). Endpoint **không đổi**, vẫn là `https://openapi.zalo.me/v3.0/oa/message/cs` mà gateway đang POST:

```jsonc
{ "recipient": { "user_id": "…" },
  "message": {
    "text": "…",                                              // tối đa 2.000 ký tự
    "attachment": {
      "type": "template",
      "payload": { "buttons": [
        { "title": "Em đã xem",                                // tối đa 100 ký tự
          "type": "oa.query.show",
          "payload": "#ilm:ack:123" }                          // tối đa 1.000 ký tự
      ] } } } }
```

**Cơ chế then chốt:** nút kiểu `oa.query.show` khiến cú bấm quay lại dưới dạng **một sự kiện `user_send_text` bình thường**, với `message.text` **chính là chuỗi payload**. Nghĩa là không cần loại webhook mới, không cần scope token mới:

- **Chiều gửi:** thêm `buttons?: { title, action, payload }[]` vào `OutboundMessage` ở **cả ba** bản `contracts` (gateway, core-api, worker). `ZaloApiService.sendText` nhận thêm tham số nút và dựng attachment trên; logic bắt lỗi `-216` (token hết hạn giữa chừng → refresh → gửi lại một lần) dùng chung không đổi. `outbound.consumer.ts` chỉ truyền `msg.buttons` xuống — **guard 48h và xử lý `blocked_48h` phía trên giữ nguyên tuyệt đối**.
- **Chiều nhận:** trong `pipeline.py`, thêm nhánh `text.startswith("#ilm:")` **TRƯỚC** nhánh text→flag hiện tại. Tập hành động đóng, tất cả đều tái dùng máy móc sẵn có:

| Hành động | Xử lý | Bot có trả lời? |
| :---- | :---- | :---- |
| `ack` | đóng dấu `Grading.studentAckAt` | Không |
| `request_advisor` | ghi một dòng `flags` — đúng cơ chế tư vấn đang theo dõi | Không |
| `select_student` | giải quyết ca anh chị em nhiều binding mà hiện đang phải hỏi bằng text thường | Không |
| *(khác / không có tiền tố)* | rơi xuống nhánh flag cũ, **không đổi** | Không |

**Một ẩn số còn lại:** các nguồn không thống nhất việc payload chỉ-có-buttons có cần trường `template_type` hay không (template `list` / `request_user_info` thì có; tài liệu nút tư vấn thì không thấy). Chỉ có thể chốt khi bắn thật vào OA thật, nên nó **nhập vào danh sách "chờ credentials" đang có** (Zalo M1.8, Sheets M2.4, khóa LLM M3). Build sau cờ cấu hình theo đúng khuôn đã dùng, xác nhận ở lần gửi thật đầu tiên.

---

## Phần 7 — Giao diện: hai drawer

Màn `pages/Criteria.tsx` **giữ nguyên** đường upload `.docx` (làm kênh import) và bảng cấu hình lớp, bổ sung hai drawer.

**Không thêm dependency:** dự án **không dùng Radix** — `components/ui/` là các component tự viết bằng `class-variance-authority` + `tailwind-merge`. Vậy `components/ui/drawer.tsx` cũng phải tự viết (panel trượt + backdrop + focus trap + phím Esc) cho đồng bộ.

**Drawer 1 — Mẫu tiêu chí** *(chỉ người có quyền `rubric_template`)*
Định nghĩa: khóa + nhãn từng tiêu chí · `scale` min/max/step · phương pháp tổng hợp · trọng số · các khoảng cấp độ · `output_fields` · khối `student_reply` gồm cả bộ nút.
Kiểm tra trực tiếp khi gõ: các khoảng cấp độ phải **liền mạch và phủ kín** `0..max`; hiển thị tổng tối đa tính được (`= 25`) và tự cập nhật khi đổi thang.

**Drawer 2 — Soạn tiêu chí** *(mọi giáo viên)*
Chọn khóa → chọn mẫu → điền.

- Mô tả band hiển thị dạng **lưới: mỗi giá trị band một dòng, mỗi dòng một ô textarea** — suy ra từ `scale`. Đổi thang 0–5 → 0–9 thì **thêm dòng**, thay vì bắt gõ lại một dòng nối bằng `;`. Đây là điểm khiến biểu diễn IELTS trở nên khả thi cho giáo viên.
- Các dòng yếu tố con; các dòng ngân hàng nhận xét (tiêu chí × ý định × nội dung).
- Trường bị mẫu khóa thì hiện read-only kèm lý do.
- `pronunciation` bị ghim, không xóa được, có badge giải thích lý do (mục 3.10).
- **Khung xem trước prompt** bên phải: hiện đúng đoạn text mà `build_system_instruction` sẽ gửi cho LLM — giáo viên thấy chính xác AI được dặn gì trước khi lưu. Đây là tính năng tạo niềm tin, đừng cắt.
- Lưu → `POST /criteria/json` → sinh version mới qua cơ chế đánh version **đã có** trong `criteria.service.ts`. Bấm "Sửa" trên một version cũ thì nạp vào drawer và lưu thành v+1.

---

## Phần 8 — Phạm vi thay đổi theo service

**core-api** — *Mới:* `criteria/rubric-schema.ts` (kiểu v2 + `normalizeRubric`) · `lib/rubric-scoring.ts` · `criteria/rubric-template.{service,controller}.ts` · `auth/privilege.guard.ts` + `@RequiresPrivilege`.
*Sửa:* `criteria.controller.ts` (thêm `POST /criteria/json`, `GET/POST /criteria/templates` — **khai báo route chữ TRƯỚC `@Get(':id')`**, nếu không `ParseIntPipe` sẽ trả 400 cho chúng) · `criteria.service.ts` · `docx-parser.ts` (xuất v2) · `worker-api.controller.ts` (tính + lưu tổng/cấp độ, cập nhật cấp độ học sinh) · `reports.service.ts` (dùng `computeTotal`) · `users.{controller,service}.ts` + `update-user.dto.ts` · `scripts/generate-rubric-template.ts`.
*Migration Prisma:* bảng `RubricTemplate` · `DashboardUser.privileges` · `Grading.totalScore/levelCode/levelLabel/studentAckAt` · `Student.currentLevelCode/currentLevelAt`.

**grading-worker** — *Mới:* `grading/rubric_schema.py`.
*Sửa:* `grading/schema.py` (scale/step, trường `fix`, lấy khóa từ `dimension.key`) · `grading/prompt.py` (gạch đầu dòng, lưới yếu tố con, ngân hàng nhận xét nhóm theo tiêu chí/ý định) · `pipeline.py` (nhánh payload nút **trước** nhánh text→flag; outbound kèm nút) · `contracts.py`.

**zalo-gateway** — `zalo/zalo-api.service.ts` (attachment nút) · `outbound/outbound.consumer.ts` (truyền xuống) · `contracts.ts`.

**dashboard** — *Mới:* `components/ui/drawer.tsx` · `pages/criteria/TemplateDrawer.tsx` · `pages/criteria/RubricDrawer.tsx` · `lib/rubric.ts` (kiểu v2 + hàm tính tổng tối đa/cấp độ dùng chung).
*Sửa:* `pages/Criteria.tsx` · `pages/SubmissionDetail.tsx` (hiện tổng/cấp độ + trường `fix`) · `pages/Users.tsx` (checkbox quyền) · `i18n/index.ts` (**cả hai khối vi và en**).

---

## Phần 9 — Bốn quyết định cần ghi vào changelog v1.6 của tài liệu kiến trúc

1. **Rubric schema v2** — bổ sung quy tắc tổng hợp điểm (`sum`/`average`/`weighted_average`), quy đổi tổng → cấp độ, mô tả band dạng danh sách, lưới yếu tố con, và ngân hàng nhận xét có cấu trúc. Mục 3.9 được viết khi chưa có rubric thật nào; hai file ở `Criteria-Source/` cho thấy mô hình cũ không đủ. Có shim v1→v2 nên **không mất dữ liệu cũ**.
2. **Mẫu tiêu chí do admin định nghĩa + quyền theo người dùng** — thêm `DashboardUser.privileges` (mảng chuỗi) thay vì role thứ ba, giữ nguyên `admin`/`staff` của changelog v1.3 mục 2.
3. **Tổng điểm và cấp độ tính ở core-api, không ở LLM và không ở worker** — một bản cài đặt duy nhất; đồng thời sửa bug `weight` bị bỏ qua trong `reports.service.ts` (Phần 2).
4. **Tin nhắn ra đầu tiên có tương tác (nút bấm)** — nới ranh giới "bot không hội thoại" của changelog v1.1 mục 1, có kiểm soát bằng tập hành động đóng. Cần chủ dự án xác nhận lại khi duyệt tài liệu này.

---

## Phần 10 — Nghiệm thu

1. **Unit test.** TS chạy qua Docker theo đúng ràng buộc changelog v1.5 mục 5:
   `docker run --rm -v "<abs-path>:/app" -w /app node:24-alpine sh -c "npm ci && npm test -- --maxWorkers=2"`
   (Git Bash thì thêm tiền tố `MSYS_NO_PATHCONV=1`). Python: `.venv/Scripts/pytest`.
   Ca mới bắt buộc:
   - `normalizeRubric` v1→v2 và không phá rubric v2 sẵn có;
   - `computeTotal` cho **cả hai file nguồn** — KID `sum` 5×(0–5) → 18/25 → "Mover (A1) ~ Junior Panda"; IELTS `average` 4×(0–9) làm tròn về số nguyên;
   - từ chối bộ `levels` bị hở khoảng hoặc chồng lấn;
   - **test đối chiếu TS ↔ Python**: hai bản `normalizeRubric` phải cho cùng kết quả trên một fixture dùng chung (đây là lưới đỡ cho việc nhân đôi code ở Phần 3).
2. **Fixture dựng từ chính hai file PDF.** Soạn cả hai rubric qua drawer rồi khẳng định JSON lưu ra tái hiện đúng các bảng trong PDF. Hai fixture này **thay thế luôn ý tưởng hardcode preset** — chúng là dữ liệu seed.
3. **Xem trước prompt.** Snapshot `build_system_instruction` cho cả hai fixture; xác nhận gạch đầu dòng, lưới yếu tố con và ngân hàng nhận xét đều render đúng.
4. **End-to-end, chưa cần khóa LLM.** `docker compose up -d --build`, rồi bắn message fixture thẳng vào queue `submissions` bằng lệnh `curl` management API đã có trong `CLAUDE.md`:
   - `"kind":"text","text":"#ilm:ack:1"` → chạy đúng nhánh payload nút mới;
   - một tin text thường → xác nhận nhánh flag cho tư vấn **không đổi**.
   Kiểm chứng: `docker compose logs grading-worker --tail 20` và
   `docker compose exec postgres psql -U ilm -d ilm -c 'select id,total_score,level_label from gradings'`.
5. **Đường chấm thật** vẫn cần khóa Gemini/OpenAI thật — không đổi so với hiện trạng, vẫn chỉ unit test với provider giả.
6. **Gửi Zalo thật** (ẩn số `template_type` ở Phần 6) cần credentials OA — xác nhận ở lần gửi thật đầu tiên.

Cập nhật `TASKS.md` sau mỗi phase, theo đúng quy ước trong `CLAUDE.md`.

---

## Phần 11 — Thứ tự triển khai đề xuất

Bốn nhánh khá độc lập, nhưng có thứ tự phụ thuộc nên tôn trọng:

| # | Nhánh | Phụ thuộc | Ghi chú |
| :---- | :---- | :---- | :---- |
| 1 | Schema v2 + shim `normalizeRubric` (TS **và** Python) | — | Nền của mọi thứ còn lại |
| 2 | `computeTotal` + migration Prisma | 1 | Sửa luôn bug `weight` |
| 3 | Nút bấm Zalo | — (chỉ cần contracts) | Nhánh nhỏ nhất, chạm cả 3 bản contracts |
| 4 | Hai drawer | 1, 2 | Cần schema và hàm tính tổng đã chốt |

**Hai điểm còn thực sự mở, cần quyết trước khi build tới:**

- Trường `template_type` của payload nút Zalo (Phần 6) — chỉ chốt được với OA thật.
- Danh sách `locked` cụ thể trên `RubricTemplate` (Phần 4) — tôi đề xuất khóa `key`/`scale`/`aggregation`/`levels`/`output_fields`, nhưng đây là quyết định nghiệp vụ, nên hỏi giáo viên của trung tâm xác nhận.

---

## Nguồn tham khảo

- `Criteria-Source/RubricSpeakingA0-C.pdf` · `Criteria-Source/Analystic-ScoringBand.pdf` (nguồn gốc, nội bộ)
- [Tin tư vấn Zalo dạng button — bản mirror eSMS](https://developers.esms.vn/en/esms-api/send-sms-api/send-zalo-message-consulting-button)
- [Template `request_user_info` của Zalo](https://developers.esms.vn/en/esms-api/send-sms-api/send-zalo-messages-to-request-users-information)
- [kyled7/zalo-api — tham chiếu `attachment` / `template_type`](https://github.com/kyled7/zalo-api/blob/master/README.md)
