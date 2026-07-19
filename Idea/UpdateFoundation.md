Tầng Hạ tầng Cơ sở (Infrastructure Layer)
Message Broker (RabbitMQ): Đóng vai trò là hệ thống định tuyến tin nhắn trung tâm sử dụng giao thức AMQP. RabbitMQ đảm bảo không mất dữ liệu bài tập của học sinh (guaranteed delivery) thông qua cơ chế gửi xác nhận (acknowledgments), hỗ trợ định tuyến phức tạp và đẩy các công việc bị lỗi vào Hàng đợi thư chết (Dead Letter Queue) để xử lý lại.  

Cache & Key-Value Store (Redis): Được sử dụng để lưu trữ tạm thời các dữ liệu có tần suất truy cập cao (như Access Token của Zalo) và quản lý giới hạn tốc độ API (Rate Limiting).  

Cơ sở dữ liệu (PostgreSQL): Lưu trữ bền vững thông tin người dùng, lịch sử chấm điểm, tiêu chí đánh giá và cấu hình hệ thống.

Các Vi dịch vụ Cốt lõi (Core Microservices)
Zalo Bot Management Service (API Gateway)

Chức năng: Là điểm tiếp nhận duy nhất cho các Webhook từ Zalo.

Luồng hoạt động: Khi học sinh nộp bài, dịch vụ này chỉ làm nhiệm vụ tiếp nhận tệp/tin nhắn, ghi nhận sự kiện vào RabbitMQ rồi lập tức trả về mã HTTP 200 cho Zalo (chỉ mất vài mili-giây) để tránh lỗi timeout. Nó cũng đóng vai trò lắng nghe từ RabbitMQ để gửi tin nhắn kết quả trả lại cho học sinh.

Tích hợp Redis: Lưu trữ và tự động làm mới Zalo Access Token.

User Management Service (Quản lý Người dùng)

Chức năng: Quản lý định danh của học sinh và quản trị viên.

Luồng hoạt động: Cung cấp API để Admin tạo tài khoản thủ công. Đồng thời, dịch vụ chạy một tiến trình ngầm (Cron job) định kỳ kéo dữ liệu (pull) từ Google Sheets, chuẩn hóa và lưu vào bảng students trong PostgreSQL. Khi Zalo Bot nhận tin nhắn, nó sẽ truy vấn dịch vụ này qua gRPC hoặc API nội bộ để xác thực SĐT ngay lập tức.

Criteria Management Service (Quản lý Tiêu chí)

Chức năng: Nơi quản lý các bộ tiêu chí chấm điểm do giáo viên biên soạn.

Luồng hoạt động: Admin upload file Word (.docx) qua giao diện. Dịch vụ này sẽ đọc, bóc tách văn bản từ tệp Word, phân loại theo khóa học/trình độ và lưu dưới dạng văn bản thuần túy (Plain text/JSON) vào PostgreSQL để sẵn sàng cung cấp ngữ cảnh (context) cho AI.

LLM Grading Service (AI Worker)

Chức năng: Đóng vai trò là Consumer (người tiêu thụ) liên tục lấy công việc từ hàng đợi RabbitMQ.  

Luồng hoạt động: Nhận tin báo có bài tập mới -> Tải file âm thanh/video lưu tạm -> Gọi API sang Criteria Service để lấy tiêu chí chấm điểm -> Đóng gói Prompt và gọi API Gemini/ChatGPT -> Nhận kết quả và đẩy lại vào RabbitMQ để Zalo Bot báo cho học sinh.

Xử lý lỗi: Nếu API của Gemini bị sập hoặc quá tải, Worker sẽ không xác nhận (nack) tin nhắn, RabbitMQ sẽ tự động giữ lại bài tập này trong hàng đợi hoặc chuyển sang Dead Letter Queue để thử lại sau.  

Web Dashboard Service (Giao diện & API)

Chức năng: Cung cấp Backend API (REST/GraphQL) và Frontend (React/Vue) cho quản trị viên.

Luồng hoạt động: Cho phép Admin xem biểu đồ KPI, tiến độ của học sinh, cấu hình hệ thống, quản lý lỗi (xem các bài tập bị rớt ở Dead Letter Queue) và upload tiêu chí đánh giá.
Để thiết kế một Web Dashboard (Giao diện Quản trị) toàn diện cho hệ thống microservices này, giao diện nên được chia thành các phân hệ (modules) phục vụ cho hai đối tượng chính: đội ngũ IT vận hành hệ thống và giáo viên/quản lý học thuật.

Dưới đây là các thành phần thiết yếu cần có cho từng phân hệ:

1. Phân hệ Giám sát Hệ thống (System Health & Queue Monitoring)
Dành cho quản trị viên IT để đảm bảo luồng dữ liệu không bị nghẽn và hệ thống chạy ổn định:

Bảng điều khiển Hàng đợi (Queue Dashboard): Tích hợp hoặc nhúng trực tiếp giao diện quản lý chuyên dụng như RabbitMQ Management UI hoặc Bull Board (nếu dùng Redis/BullMQ). Tính năng này cho phép theo dõi số lượng bài tập đang ở trạng thái chờ (pending), đang xử lý (active) theo thời gian thực.  

Quản lý Hàng đợi Lỗi (Dead Letter Queue): Đây là thành phần cực kỳ quan trọng. Khi AI Worker chấm bài thất bại sau nhiều lần thử lại (do file hỏng, API Gemini sập), bài tập sẽ bị đẩy vào Dead Letter Queue. Tại đây, Admin có thể xem chi tiết nguyên nhân lỗi và nhấn nút "Thử lại" (Retry) thủ công sau khi khắc phục xong sự cố mạng.  

Giám sát Nguồn lực (Resource Metrics): Biểu đồ theo dõi trạng thái các Worker, băng thông mạng, và API Rate Limit của Zalo, giúp phát hiện sớm tình trạng quá tải.

2. Phân hệ Quản trị Học viên (Student Management)
Dành cho bộ phận giáo vụ kiểm soát định danh người dùng:

Trạng thái Đồng bộ (Sync Status): Bảng ghi chú thời gian (timestamp) hệ thống tự động kéo dữ liệu (pull) lần cuối từ Google Sheets, kèm theo cảnh báo nếu có lỗi (như SĐT sai định dạng, dòng dữ liệu bị trống).

Hồ sơ Học viên (Student Directory): Một bảng danh sách hiển thị thông tin học viên, có bộ lọc tìm kiếm theo lớp học hoặc trình độ. Cho phép quản trị viên thêm/sửa học viên thủ công thay vì đợi đồng bộ.

Phân bổ Trình độ: Cho phép gán từng nhóm học viên với một trình độ cụ thể (ví dụ: Starter, Movers, IELTS 5.0) để hệ thống tự động ánh xạ tới đúng bộ tiêu chí chấm điểm khi học sinh gửi bài.

3. Phân hệ Theo dõi Tình trạng Nộp bài (Submission Tracking)
Dành cho giáo viên theo dõi dòng chảy bài tập hàng ngày:

Kanban/Bảng trạng thái Trực tiếp: Danh sách bài tập hiển thị theo luồng trạng thái: Đã nhận từ Zalo -> Đang trích xuất Audio -> Đang chấm (AI) -> Hoàn thành (Đã gửi Zalo) -> Báo lỗi.

Trình xem Chi tiết Bài nộp: Khi nhấn vào một bài làm, giao diện sẽ cung cấp một trình phát phương tiện (Audio/Video Player) lấy trực tiếp file gốc từ bộ nhớ (như S3/MinIO).

Khu vực Kiểm duyệt Điểm số: Hiển thị chi tiết kết quả trả về từ LLM (nhận xét ngữ pháp, phát âm, từ vựng, điểm số). Hệ thống có thể cung cấp tính năng "Kiểm duyệt thủ công" (Manual Override), cho phép giáo viên sửa lại nhận xét của AI trước khi xác nhận gửi tin nhắn Zalo về cho học sinh, nhằm tránh trường hợp AI bị "ảo giác" (hallucination) và chấm sai.

4. Phân hệ Báo cáo và KPI (Reporting & Analytics)
Giúp ban quản lý đánh giá chất lượng học tập và chi phí vận hành:

KPI Học sinh: Biểu đồ hiển thị tỷ lệ học sinh nộp bài đúng hạn, thống kê điểm số trung bình theo từng kỹ năng, và danh sách những học sinh liên tục vắng/không nộp bài để có biện pháp nhắc nhở.

Thống kê Chi phí AI (Cost Dashboard): Biểu đồ đếm lượng token tiêu thụ và quy đổi ra chi phí USD ước tính của API Gemini/ChatGPT theo ngày/tuần/tháng. Việc này giúp trung tâm cảnh giác với các chi phí phát sinh bất thường (ví dụ: học sinh gửi file thời lượng quá dài).

Trung tâm Xuất dữ liệu (Data Export): Tính năng xuất các báo cáo này ra định dạng Excel hoặc PDF để lưu trữ định kỳ hoặc gửi cho phụ huynh.

5. Phân hệ Quản trị Tiêu chí Chấm điểm (Criteria Configuration)
Quản lý Kho Tiêu chí: Giao diện cho phép giáo viên tải lên các tệp Word (.docx) chứa tiêu chí (Rubric) cho từng dạng bài tập. Cung cấp trình xem trước (Preview) để xác nhận hệ thống đã bóc tách văn bản chuẩn xác trước khi lưu vào PostgreSQL.

Quản lý Dòng nhắc (Prompt Management): Cho phép các quản trị viên tinh chỉnh "System Prompt" mẫu gửi cho LLM (ví dụ thay đổi giọng điệu của AI từ nghiêm khắc sang khích lệ nhẹ nhàng), hoặc gắn các tham số nhiệt độ (temperature) để thay đổi độ sáng tạo của mô hình AI khi trả lời.

Đề xuất các Vi dịch vụ Phụ trợ (Optional Microservices)
Để hệ thống hoạt động chuẩn mô hình doanh nghiệp, bạn nên cân nhắc thêm các dịch vụ sau:

Media Processing Service (Xử lý Đa phương tiện): Nếu học sinh gửi video (.mp4), việc gửi thẳng lên LLM sẽ cực kỳ tốn token. Dịch vụ này (sử dụng thư viện FFmpeg) sẽ tự động bắt luồng từ RabbitMQ, trích xuất âm thanh (.mp3) khỏi video để giảm dung lượng trước khi đẩy sang LLM Grading Service.

Blob Storage Service (MinIO/S3 Gateway): Thay vì để các dịch vụ truyền dữ liệu nhị phân trực tiếp cho nhau hoặc lưu ổ cứng cục bộ gây tràn bộ nhớ, dịch vụ này quản lý việc đẩy file nhận được từ Zalo lên Object Storage (như AWS S3 hoặc MinIO On-premise). Các dịch vụ khác chỉ cần truyền cho nhau "đường dẫn URL" của tệp tin.

Notification & Alert Service: Giám sát RabbitMQ và PostgreSQL. Nếu phát hiện hàng đợi tồn đọng quá 1.000 bài tập chưa chấm hoặc tỷ lệ lỗi API cao, dịch vụ này sẽ tự động bắn cảnh báo khẩn cấp qua Telegram hoặc Email cho đội ngũ IT.