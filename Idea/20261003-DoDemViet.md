# Đo → Đếm → Viết — chấm IELTS ổn định bằng số đo thay cho "LLM tự phán band"

**Ngày:** 2026-10-03 · **Chủ dự án:** duyệt trực tiếp, không qua học thuật (học thuật chỉ quan tâm điểm
và nhận xét cuối cùng) · **Phạm vi:** rubric IELTS Speaking (`ielts_speaking`); thiếu nhi giữ nguyên.

## 1. Vấn đề — đo được, không phỏng đoán

| Việc | Ai làm | Đo được tuần này |
|---|---|---|
| Đo phát âm | Azure | Tất định: cùng file luôn 88.6 |
| Hiểu học viên định nói gì | Gemini | Tốt: "gangs" nhận đúng 10/10 (Azure 0/10) |
| **Cho band** Fluency / Lexical / Grammar | Gemini | **Dao động ±1 band**: cùng file ra 6.0 rồi 7.0 (bài 265/266); 1 lượt ở temperature 0 vẫn lệch Fluency 5↔6 (bài 270) |
| Số đo → band | Bảng ngưỡng | Ổn định, hiệu chỉnh được (2/5 → 4/5 khớp giáo viên) |

Chấm 3 lượt lấy trung vị đã làm ổn định (bài 267–269) nhưng chi phí +55% — chủ dự án từ chối,
đang chạy 1 lượt. Kết luận: phần KHÔNG ổn định duy nhất là để LLM tự quyết con số band.
LLM ổn định hơn nhiều khi **liệt kê bằng chứng** ("One the day", "experience" lặp lại y nhau
giữa các lượt) so với khi **chấm điểm**.

## 2. Thiết kế

1. **Gemini nghe 1 lần — trích bằng chứng** (gộp vào lượt chấm hiện có, không thêm lượt gọi):
   lỗi ngữ pháp + lỗi dùng từ (trích nguyên văn + sửa), cấu trúc phức đã dùng, từ vựng ít phổ
   biến/thành ngữ dùng đúng, cách nói (đã có: `delivery`).
2. **Azure đo** (đã có) + **nhịp nói từ mốc từng từ** (mới, tất định): tốc độ nói (từ/phút),
   số/độ dài khoảng ngắt, độ dài trung bình một đoạn nói liền (MLR), tỷ lệ thời gian có tiếng.
3. **Code tính band** cho cả 4 tiêu chí qua bảng ngưỡng hiệu chỉnh theo điểm giáo viên:
   - Pronunciation: Azure (như hiện tại).
   - Fluency: nhịp nói + ngắt + MLR (Coherence: Gemini chọn mức có tiêu chí).
   - Lexical: độ đa dạng từ (MTLD), tỷ lệ lỗi dùng từ /100 từ, số từ nâng cao. Bước sau: CEFR-J.
   - Grammar: tỷ lệ câu không lỗi, số cấu trúc phức /100 từ.
4. **Gemini viết nhận xét** (lượt chữ thuần, rẻ): điểm đã chốt + bằng chứng + kịch bản xoay vòng
   → chỉ VIẾT, không chấm ⇒ nhận xét luôn khớp điểm.

## 3. Lộ trình — học viên không bị ảnh hưởng cho tới giai đoạn 3

| Giai đoạn | Nội dung | Ảnh hưởng tới điểm |
|---|---|---|
| **1 — Chạy ngầm** (làm ngay) | Trích bằng chứng trong lượt chấm hiện có; tính số đo + band theo công thức (ngưỡng khởi điểm, CHƯA hiệu chỉnh); lưu `assessment.measures` / `assessment.shadow_bands`. Script so band ngầm ↔ điểm giáo viên. | **Không** |
| 2 — Hiệu chỉnh | Khi có ≥ 30 bài IELTS giáo viên đã sửa điểm: fit lại bảng ngưỡng từng tiêu chí; thêm CEFR-J. Chuyển sang khi band ngầm khớp giáo viên TỐT HƠN điểm Gemini hiện tại (đo bằng số bài khớp + sai số trung bình). | Không |
| 3 — Chuyển | Band từ công thức thay band Gemini (công tắc trong Cấu hình, tắt được ngay); lượt viết nhận xét tách ra chữ thuần; gộp lượt "ghi lời định nói" vào lượt trích bằng chứng ⇒ chỉ gửi audio cho Gemini MỘT lần. | Có (có công tắc) |

## 4. Chi phí (bài ~90 giây)

| | Hiện tại (1 lượt) | Giai đoạn 1 | Giai đoạn 3 (ước tính) |
|---|---|---|---|
| Gemini | ~0.032 $ | ~0.034 $ (output dài hơn vì có bằng chứng) | ~0.025–0.030 $ (audio gửi 1 lần) |
| Azure | ~0.033 $ | ~0.033 $ | ~0.033 $ |

## 5. Rủi ro

- Bảng ngưỡng giai đoạn 1 là **điểm khởi đầu, chưa hiệu chỉnh** — vì vậy chỉ chạy ngầm.
- Đọc/học thuộc làm tốc độ nói cao ⇒ band Fluency theo công thức có thể cao giả; đã có cờ
  `delivery`, giai đoạn 2 cân nhắc dùng nó trong công thức (chủ dự án hiện chọn "chỉ gắn cờ").
- Coherence khó đo bằng công thức ⇒ vẫn là đánh giá của LLM, nhưng dạng chọn mức cố định.
- Cần dữ liệu giáo viên: 5 bài đã có + 11 bài dev-test + bài thật của pilot.

## 6. Việc đã làm (cập nhật khi xong)

- [x] Giai đoạn 1 (triển khai pilot 2026-10-03): `grading/evidence.py` (schema TÙY CHỌN — dữ liệu ngầm
      không bao giờ làm hỏng lượt chấm), `grading/measures.py` (số đo + band ngầm, thuần, có test), nối vào
      pipeline cho IELTS, lưu `assessment.evidence/measures/shadow_bands`. Worker 559 test xanh.
- [x] Script so sánh: `services/core-api/scripts/shadow-vs-teacher.sql`.
- Đo thật đầu tiên (bài 271, file đọc soạn sẵn của bài 237): trích bằng chứng ổn định (đúng 2 lỗi
  ngữ pháp như mọi lượt trước); số đo hợp lý (122 từ/phút, MLR 10.8); NHƯNG band ngầm Lexical = 9 vì
  bài soạn sẵn có độ đa dạng từ rất cao (MTLD 98.6) ⇒ giai đoạn 2 phải đưa `delivery`
  (đọc/học thuộc) vào công thức Lexical/Grammar, không chỉ Fluency. Điểm AI 1 lượt trên cùng file:
  6.0 / 7.0 / 6.0 / 7.0 (bài 265/266/270/271) — lý do chính để làm giai đoạn 3.
- [x] **Thử hiệu chỉnh giai đoạn 2 (2026-10-03) — KẾT LUẬN: CHƯA chuyển sang công thức.** Dữ liệu: chỉ bài
      học thuật ĐÃ SỬA điểm (187, 189, 234, 236 — binhlt) + bài 237 (lead học thuật, 6 cả 4 tiêu chí).
      Bài 103 loại (gửi nguyên điểm, không có số đo Azure). Đánh giá leave-one-out (bài chưa thấy):
      công thức 0/5 khớp, lệch TB 1.6–1.8 band — KÉM hơn AI (lệch 0.4–1.0). Hai nguyên nhân:
      1. Mốc từng từ của Azure KHÔNG đo được khoảng ngắt (bài 234: 193 từ/phút, 70 từ/đoạn liền — Azure
         kéo dài thời lượng từ lấp khoảng lặng). Đo trôi chảy bằng công thức cần dò khoảng lặng từ AUDIO (VAD).
      2. Đếm lỗi không tỷ lệ với điểm giáo viên (bài 236: 8 lỗi/13 câu ⇒ công thức band 4, giáo viên 6).
- [x] **Chuẩn chấm đã chốt (chủ dự án 2026-10-03): MỌI bài IELTS là bài NÓI** — đọc kịch bản luôn bị trừ
      (chuẩn của lead, bài 237). Hệ thống hiện tại khớp lead (237 ⇒ 6.0) nhưng chấm THẤP hơn binhlt 1–1.6
      band ở các bài đọc kịch bản (189/234/236 binhlt cho Fluency 7). Đó là hai CHUẨN khác nhau, không phải
      lỗi hệ thống ⇒ **điểm binhlt trên bài đọc kịch bản KHÔNG được dùng để nới lỏng hệ thống.** Dữ liệu
      hiệu chỉnh hợp lệ = điểm chấm theo chuẩn lead.
- [ ] Giai đoạn 2 (làm lại khi có ≥ 30 bài chấm theo chuẩn lead): dò khoảng lặng từ audio thay mốc Azure;
      CEFR-J; mô hình theo mức nặng của lỗi thay vì đếm.
- [ ] Giai đoạn 3: công tắc chuyển, lượt viết nhận xét chữ thuần, gộp lượt audio.
