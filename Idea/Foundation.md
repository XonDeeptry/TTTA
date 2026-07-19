**HỆ THỐNG BOT CHỮA BÀI TRÊN ZALO OA**

Tài liệu yêu cầu, thiết kế & các bước triển khai

Trung tâm Anh ngữ ILM

Phiên bản 1.0

# **Mục lục** {#mục-lục}

[Mục lục	2](#mục-lục)

[1\. Mục tiêu & phạm vi (Yêu cầu)	3](#1.-mục-tiêu-&-phạm-vi-\(yêu-cầu\))

[1.1. Bot làm gì	3](#1.1.-bot-làm-gì)

[1.2. Ranh giới (bot không làm gì)	3](#1.2.-ranh-giới-\(bot-không-làm-gì\))

[1.3. Nguyên tắc giao tiếp	3](#1.3.-nguyên-tắc-giao-tiếp)

[2\. Kiến trúc & công cụ (Thiết kế)	3](#2.-kiến-trúc-&-công-cụ-\(thiết-kế\))

[2.1. Tổng quan kiến trúc	3](#2.1.-tổng-quan-kiến-trúc)

[2.2. Mô hình dữ liệu (Google Sheets)	4](#2.2.-mô-hình-dữ-liệu-\(google-sheets\))

[2.3. Lựa chọn AI để chữa bài	4](#2.3.-lựa-chọn-ai-để-chữa-bài)

[2.4. Hạ tầng	5](#2.4.-hạ-tầng)

[3\. Workflow vận hành	5](#3.-workflow-vận-hành)

[3.1. Workflow gộp & rẽ nhánh	5](#3.1.-workflow-gộp-&-rẽ-nhánh)

[3.2. Onboarding & ràng buộc (tư vấn cấp số điện thoại)	5](#3.2.-onboarding-&-ràng-buộc-\(tư-vấn-cấp-số-điện-thoại\))

[3.3. Nhánh chữa bài (chi tiết)	5](#3.3.-nhánh-chữa-bài-\(chi-tiết\))

[3.4. Nhánh hỏi học thuật / ngoài học thuật	6](#3.4.-nhánh-hỏi-học-thuật-/-ngoài-học-thuật)

[3.5. Báo chưa nộp cuối ngày	6](#3.5.-báo-chưa-nộp-cuối-ngày)

[3.6. Làm mới token (chạy nền)	6](#3.6.-làm-mới-token-\(chạy-nền\))

[4\. Các bước thực hiện (Triển khai)	6](#4.-các-bước-thực-hiện-\(triển-khai\))

[4.1. Chuẩn bị (làm sớm, song song)	6](#4.1.-chuẩn-bị-\(làm-sớm,-song-song\))

[4.2. Hạ tầng (nên giao freelancer)	6](#4.2.-hạ-tầng-\(nên-giao-freelancer\))

[4.3. Kết nối Zalo	6](#4.3.-kết-nối-zalo)

[4.4. Dựng Google Sheets	7](#4.4.-dựng-google-sheets)

[4.5. Dựng các workflow (theo thứ tự)	7](#4.5.-dựng-các-workflow-\(theo-thứ-tự\))

[4.6. Chạy thử (Pilot)	7](#4.6.-chạy-thử-\(pilot\))

[4.7. Mở rộng	7](#4.7.-mở-rộng)

[5\. Chi phí (ước lượng)	7](#5.-chi-phí-\(ước-lượng\))

[6\. Checklist các điểm dễ gãy	7](#6.-checklist-các-điểm-dễ-gãy)

[7\. Phân vai: ai làm gì	8](#7.-phân-vai:-ai-làm-gì)

# **1\. Mục tiêu & phạm vi (Yêu cầu)** {#1.-mục-tiêu-&-phạm-vi-(yêu-cầu)}

Xây dựng một bot trên Zalo OA phục vụ việc học tập của học sinh, vận hành theo nguyên tắc: AI tự động hóa để nâng hiệu suất, con người vẫn giữ quyết định ở những khâu nhạy cảm. Bot KHÔNG thay thế con người ở giai đoạn này.

## **1.1. Bot làm gì** {#1.1.-bot-làm-gì}

* Chữa bài: học sinh gửi bài (chủ yếu clip nói khoảng 5 phút) lên OA, bot nghe và nhận xét theo trình độ của khóa.

* Báo chưa nộp: cuối mỗi ngày có giao bài, bot tổng hợp danh sách học sinh chưa nộp theo từng lớp và gửi cho tư vấn phụ trách.

* Hỗ trợ học tập: trả lời các câu hỏi của học sinh trong phạm vi học thuật.

## **1.2. Ranh giới (bot không làm gì)** {#1.2.-ranh-giới-(bot-không-làm-gì)}

* Chỉ trao đổi về học tập. Mọi câu hỏi ngoài học thuật (học phí, lịch, khiếu nại…) được chuyển cờ cho tư vấn và bot KHÔNG trả lời học sinh.

* Bot KHÔNG nhắc học sinh nộp bài; việc đôn đốc do tư vấn xử lý qua danh sách chưa nộp.

* Bot KHÔNG tự nhắn tin cho phụ huynh. Mọi việc chạm phụ huynh do tư vấn (người thật) thực hiện.

* Bài chữa hằng ngày mang tính luyện tập, KHÔNG thay phần chấm điểm chính thức của giáo viên.

## **1.3. Nguyên tắc giao tiếp** {#1.3.-nguyên-tắc-giao-tiếp}

Hai làn tách bạch: bot chỉ nói chuyện với học sinh về việc học; tư vấn (người) cầm mọi việc khác và là cầu nối duy nhất tới phụ huynh.

# **2\. Kiến trúc & công cụ (Thiết kế)** {#2.-kiến-trúc-&-công-cụ-(thiết-kế)}

## **2.1. Tổng quan kiến trúc** {#2.1.-tổng-quan-kiến-trúc}

Hệ thống gồm bốn công cụ chính cộng với vai trò con người (tư vấn). Bảng dưới ghi rõ công cụ nào phụ trách khâu nào.

| Công cụ | Vai trò | Khâu phụ trách |
| :---- | :---- | :---- |
| Zalo OA | Kênh nhận/gửi tin (qua app trên Zalo Developers) | Nhận clip & câu hỏi của học sinh; gửi nhận xét trả lời |
| n8n (trên VPS) | Bộ máy điều phối | Nhận webhook, chống trùng, phân loại tin, gọi AI, đọc/ghi dữ liệu, chạy tác vụ theo lịch |
| Gemini Flash | Trí tuệ (LLM) | Nghe & chấm bài nói; trả lời câu hỏi học thuật |
| Google Sheets | Lưu trữ & đối chiếu | Danh sách HS, tiêu chí chữa, log nộp bài, bảng ghép Zalo–HS |
| Tư vấn (người) | Vận hành & quyết định | Cập nhật danh sách, kích hoạt HS mới, nhận báo cáo chưa nộp và cờ ngoài học thuật |

## **2.2. Mô hình dữ liệu (Google Sheets)** {#2.2.-mô-hình-dữ-liệu-(google-sheets)}

Toàn bộ dữ liệu nằm trên Google Sheet để tư vấn tự cập nhật. Dùng dropdown chuẩn cho các trường khóa/lớp/cơ sở để tránh sai khi đối chiếu.

| Bảng (tab) | Trường chính | Dùng để |
| :---- | :---- | :---- |
| DanhSach | mã HV, tên, SĐT, khóa (key), lớp, cơ sở, trạng thái, zalo\_user\_id | Danh sách học sinh; tư vấn cập nhật khi có HS mới hoặc đổi khóa |
| TieuChi | key khóa, mô tả band, tiêu chí chữa | DB tiêu chí chữa bài, gắn theo khóa (vd basic \= band 0–3) |
| LogNop | ngày, mã HV, lớp, zalo\_user\_id, link bài | Ghi nhận ai đã nộp; dùng để đối chiếu chưa nộp |
| ChoGan | zalo\_user\_id, tên hiển thị, thời gian, SĐT (tư vấn điền), trạng thái | Ghép tài khoản Zalo với học sinh khi nhắn lần đầu |
| LichGiaoBai | ngày có giao bài | Để báo chưa nộp không chạy nhầm vào ngày nghỉ |

**Điểm dễ gãy:** giá trị key khóa ở DanhSach phải khớp tuyệt đối với key ở TieuChi. “basic” và “Basic ” (thừa dấu cách) là hai key khác nhau với máy — dùng cùng một dropdown chuẩn ở cả hai nơi.

## **2.3. Lựa chọn AI để chữa bài** {#2.3.-lựa-chọn-ai-để-chữa-bài}

Tiêu chí loại trừ đầu tiên: model phải nghe được file audio. Khuyến nghị dùng Gemini dòng Flash vì nhận audio trực tiếp và rẻ nhất.

| Model | Nhận audio trực tiếp | Ghi chú |
| :---- | :---- | :---- |
| Gemini Flash | Có | Rẻ nhất; khuyến nghị dùng cho cả chữa bài (audio) và trả lời học thuật (text) |
| GPT-4o Audio | Có | Dùng được nhưng giá token đắt hơn Gemini nhiều |
| Claude | Không | Mạnh viết nhận xét nhưng phải thêm bước chuyển giọng nói thành văn bản trước |
| Grok | Không phù hợp | Rẻ về text, không phải lựa chọn cho việc nghe-chấm audio |

**Lưu ý chất lượng:** LLM chấm tốt nội dung, ngữ pháp, từ vựng, độ trôi. Riêng phát âm ở mức âm vị thì các API chuyên dụng (Speechace, ELSA, Azure Pronunciation Assessment) chính xác hơn — cân nhắc ghép thêm về sau nếu chấm phát âm thành ưu tiên.

## **2.4. Hạ tầng** {#2.4.-hạ-tầng}

* **Yêu cầu cứng:** n8n phải có địa chỉ HTTPS công khai cố định để Zalo gọi webhook tới.

* **Cho pilot:** có thể dùng n8n Cloud để bỏ qua việc dựng server (\~500–650k/tháng), nhưng gói này tính tiền theo số lượt chạy nên chỉ đủ cho 1–2 lớp.

* **Cho vận hành thật (500 HS):** bắt buộc dùng VPS tự host — n8n bản tự host không giới hạn số lượt chạy, chỉ trả tiền VPS (\~120–250k/tháng) dù 80 hay 500 học sinh.

* **Nhân lực:** việc dựng VPS, SSL, n8n và app Zalo là việc quản trị hệ thống — nên giao cho một freelancer DevOps/n8n. Chủ trung tâm giữ vai trò ra đề và nghiệm thu.

# **3\. Workflow vận hành** {#3.-workflow-vận-hành}

## **3.1. Workflow gộp & rẽ nhánh** {#3.1.-workflow-gộp-&-rẽ-nhánh}

Gộp tất cả vào MỘT workflow nhận mọi tin từ webhook rồi rẽ nhánh bên trong (gọn và rẻ hơn tách nhiều workflow). Trình tự:

1. Nhận tin từ webhook Zalo OA.

2. Chống trùng: nếu message\_id đã xử lý thì bỏ qua (Zalo có thể bắn lại).

3. Kiểm tra zalo\_user\_id đã được gán trong DanhSach chưa.

4. Chưa gán → ghi vào tab ChoGan \+ bot trả lời chung (“đang kích hoạt tài khoản”). Kết thúc.

5. Đã gán → phân loại tin và rẽ nhánh:

* Audio (clip) → nhánh chữa bài (mục 3.3).

* Text hỏi học thuật → gọi AI trả lời học sinh.

* Ngoài học thuật → tạo cờ cho tư vấn, KHÔNG trả lời học sinh.

## **3.2. Onboarding & ràng buộc (tư vấn cấp số điện thoại)** {#3.2.-onboarding-&-ràng-buộc-(tư-vấn-cấp-số-điện-thoại)}

Webhook chỉ trả về user\_id ẩn danh, không trả về số điện thoại — nên việc gán diễn ra ngay khi học sinh nhắn lần đầu:

1. Học sinh nhắn lần đầu → n8n thấy user\_id lạ → ghi vào ChoGan \+ bot nhắn tạm “đang kích hoạt, em chờ chút”.

2. Tư vấn mở ChoGan, điền số điện thoại của em đang onboard.

3. n8n đối chiếu SĐT trong DanhSach → ghi user\_id vào đúng dòng học sinh → bot nhắn đã kích hoạt xong.

4. Một Zalo gắn nhiều HV (anh em chung máy): cho phép nhiều dòng cùng user\_id; khi nhận bài, nếu trùng thì bot hỏi “bài của bạn nào”.

## **3.3. Nhánh chữa bài (chi tiết)** {#3.3.-nhánh-chữa-bài-(chi-tiết)}

Toàn bộ chuỗi dưới đây nằm gọn trong một lần chạy (một execution):

1. Lấy user\_id, message\_id, link file audio từ payload.

2. Tra DanhSach theo user\_id → ra mã HV / khóa / lớp / cơ sở.

3. Tra TieuChi theo key \= khóa → lấy bộ tiêu chí chữa.

4. Tải file audio từ link.

5. Gọi Gemini: đầu vào \= audio \+ tiêu chí (+ tài liệu buổi) → nhận xét đúng trình độ (có rào chắn: chỉ học thuật, không bịa, giọng động viên).

6. Gọi API gửi tin OA → trả nhận xét cho học sinh (trong 48h nên miễn phí).

7. Ghi một dòng vào LogNop.

## **3.4. Nhánh hỏi học thuật / ngoài học thuật** {#3.4.-nhánh-hỏi-học-thuật-/-ngoài-học-thuật}

* Hỏi học thuật (ngữ pháp, từ vựng, cách học) → gọi Gemini trả lời học sinh dựa trên tài liệu trung tâm.

* Ngoài học thuật → ghi cờ “chuyển tư vấn” (vào tab Sheet hoặc nhắn Zalo của tư vấn); KHÔNG trả lời học sinh.

## **3.5. Báo chưa nộp cuối ngày** {#3.5.-báo-chưa-nộp-cuối-ngày}

Workflow chạy theo lịch (cron), cuối ngày có giao bài (đọc LichGiaoBai):

1. Lấy danh sách HV từng lớp trong DanhSach (trạng thái đang học).

2. So với LogNop hôm nay → ra ai chưa gửi.

3. Gom danh sách theo lớp.

4. Gửi cho tư vấn phụ trách lớp đó. Không nhắc học sinh, không nhắn phụ huynh.

## **3.6. Làm mới token (chạy nền)** {#3.6.-làm-mới-token-(chạy-nền)}

Access token của OA sống khoảng một giờ. Bắt buộc có một workflow chạy nền tự dùng refresh\_token để xin token mới định kỳ — nếu không, bot sẽ chết sau khoảng một tiếng. Có sẵn template n8n quản lý token để import và sửa lại.

# **4\. Các bước thực hiện (Triển khai)** {#4.-các-bước-thực-hiện-(triển-khai)}

## **4.1. Chuẩn bị (làm sớm, song song)** {#4.1.-chuẩn-bị-(làm-sớm,-song-song)}

1. Đăng ký và xác thực OA doanh nghiệp (khâu duyệt mất vài ngày — ưu tiên làm trước).

2. Học thuật chuẩn hóa tài liệu bài theo từng buổi và bộ tiêu chí chữa cho từng khóa (đây là “mồi” quyết định chất lượng chữa).

3. Tư vấn dựng/chuẩn hóa danh sách HS trong Google Sheet (mã HV, SĐT, key khóa chuẩn theo dropdown).

## **4.2. Hạ tầng (nên giao freelancer)** {#4.2.-hạ-tầng-(nên-giao-freelancer)}

1. Thuê VPS Ubuntu (tối thiểu 2GB RAM).

2. Tạo subdomain riêng (ví dụ n8n.ilm.edu.vn) trỏ về IP VPS. KHÔNG đụng vào bản ghi tên miền gốc đang chạy website.

3. Cài đặt SSL (HTTPS) và n8n (gợi ý Docker \+ Caddy để tự xin chứng chỉ).

4. Thay thế nhanh cho pilot: dùng n8n Cloud để bỏ qua toàn bộ bước này, chuyển sang VPS khi mở rộng.

## **4.3. Kết nối Zalo** {#4.3.-kết-nối-zalo}

1. Tạo app tại Zalo Developers, lấy App ID \+ Secret Key, liên kết với OA.

2. Khai báo Webhook URL \= địa chỉ n8n; bật các sự kiện: follow, gửi text, gửi hình, gửi audio.

3. Đăng ký quyền gửi tin tư vấn; khai báo IP Access \= IP của VPS.

4. Lấy access\_token \+ refresh\_token (OAuth v4) và dựng workflow tự làm mới token.

## **4.4. Dựng Google Sheets** {#4.4.-dựng-google-sheets}

1. Tạo 5 tab theo mục 2.2.

2. Thiết lập dropdown chuẩn cho key khóa, lớp, cơ sở; bảo đảm key khóa khớp với TieuChi.

## **4.5. Dựng các workflow (theo thứ tự)** {#4.5.-dựng-các-workflow-(theo-thứ-tự)}

1. Workflow làm mới token (chạy nền).

2. Workflow webhook nhận tin chạy thông.

3. Workflow onboarding/gán (mục 3.2).

4. Workflow chữa bài (mục 3.3) — chạy được một ca thật.

5. Workflow phân loại text học thuật / ngoài học thuật.

6. Workflow báo chưa nộp cuối ngày (mục 3.5).

## **4.6. Chạy thử (Pilot)** {#4.6.-chạy-thử-(pilot)}

Pilot 1–2 lớp trong 2–4 tuần, lý tưởng là một lớp luyện thi cấp 3\. Đo ba thứ:

* Chi phí AI audio thực tế trên mỗi học sinh mỗi ngày (khoản tăng theo số HS — chỉ lộ khi chạy thật).

* Chất lượng nhận xét (giáo viên kiểm mẫu).

* Tỷ lệ gán lỗi ở khâu onboarding.

## **4.7. Mở rộng** {#4.7.-mở-rộng}

Khớp các chỉ số pilot rồi mở rộng dần ra các lớp/cơ sở khác. Nếu pilot chạy trên n8n Cloud, đây là lúc chuyển sang VPS tự host.

# **5\. Chi phí (ước lượng)** {#5.-chi-phí-(ước-lượng)}

| Khoản | Loại | Ước tính |
| :---- | :---- | :---- |
| VPS chạy n8n | Cố định | \~120–250k/tháng (không đổi theo số HS). Pilot có thể dùng n8n Cloud \~500–650k/tháng. |
| Gemini Flash | Biến đổi | \~300k–1,5 triệu/tháng cho 2.000–3.000 bài. Ghìm bằng cách giới hạn độ dài clip. |
| Zalo OA | Gần như miễn phí | Tin trả lời trong 48h miễn phí; chỉ phát sinh nhỏ ở tin ngoài khung. |
| Google Sheets | Gần như miễn phí | Dùng tài khoản sẵn có. |
| Dựng hạ tầng \+ workflow (freelancer) | Một lần | Thỏa thuận theo phạm vi; dùng tài liệu này làm đề bài. |

Khoản đáng theo dõi nhất là Gemini (tăng theo số học sinh), không phải tiền server. Vì vậy pilot để đo chi phí thật là bước bắt buộc trước khi mở rộng.

# **6\. Checklist các điểm dễ gãy** {#6.-checklist-các-điểm-dễ-gãy}

* n8n có HTTPS công khai cho webhook.

* Workflow tự làm mới token (token sống \~1 giờ).

* Chống trùng theo message\_id.

* Key khóa khớp tuyệt đối giữa DanhSach và TieuChi (dùng dropdown).

* IP allowlist của app Zalo \= IP VPS.

* Giới hạn độ dài clip để kiểm soát chi phí audio.

* Token/secret cất trong credentials của n8n, không để trong Sheet.

* Có lịch ngày giao bài để báo chưa nộp không chạy nhầm ngày nghỉ.

# **7\. Phân vai: ai làm gì** {#7.-phân-vai:-ai-làm-gì}

| Vai trò | Trách nhiệm |
| :---- | :---- |
| Chủ trung tâm | Ra đề, nghiệm thu, quyết ngân sách; cung cấp định hướng và tài liệu/tiêu chí. |
| Freelancer DevOps/n8n | Dựng VPS \+ n8n \+ HTTPS, tạo app Zalo, dựng và bảo trì các workflow. |
| Bộ phận học thuật | Chuẩn hóa tài liệu bài theo buổi và bộ tiêu chí chữa cho từng khóa. |
| Tư vấn | Cập nhật DanhSach, điền ChoGan để kích hoạt HS, nhận báo cáo chưa nộp và cờ ngoài học thuật. |

Hết tài liệu. Phiên bản 1.0 — phạm vi giai đoạn 1 (bot chữa bài). Các phần mở rộng (kế toán, tuyển sinh, điểm danh – chấm công…) sẽ làm sau khi bot này chạy ổn định.