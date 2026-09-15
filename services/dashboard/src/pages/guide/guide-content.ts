/**
 * Nội dung màn "Hướng dẫn" — văn xuôi dài, KHÔNG để trong `i18n/index.ts`.
 *
 * `i18n/index.ts` là nơi chứa nhãn giao diện (chuỗi ngắn, tra theo khóa phẳng). Hướng dẫn thì
 * ngược lại: từng đoạn văn có thứ tự, có cấu trúc lồng nhau — nhét vào bảng khóa phẳng sẽ vừa khó
 * đọc vừa dễ sót. Ở đây dùng một OBJECT CÓ KHÓA CỐ ĐỊNH thay cho mảng, nên TypeScript ép hai bản
 * vi/en phải có ĐÚNG cùng bộ khóa — cùng tinh thần với `Record<keyof typeof vi, string>` bên i18n:
 * thiếu một mục là `tsc -b` đỏ, không phải chờ người dịch phát hiện.
 *
 * `uiKeys` cố tình trỏ tới khóa i18n THẬT của nút/nhãn đang có trên màn hình, để khi ai đó đổi chữ
 * trên nút thì hướng dẫn đổi theo, không trôi ra khỏi giao diện.
 *
 * CHỈ dùng khóa của nhãn TĨNH. Khóa có placeholder (`{{...}}`, ví dụ `templates.maxTotal`) render
 * ra chuỗi cụt vì ở đây không có giá trị để truyền vào — hãy nhắc tới chúng trong văn xuôi thay vì
 * đưa vào `uiKeys`. `UiChips` cũng tự bỏ qua loại khóa này để lỗi không hiện ra trước mặt giáo viên.
 *
 * Pilot 2026-09-15: viết lại cho ĐỘI HỌC THUẬT (giáo viên, không phải IT) — theo đúng việc họ làm,
 * mỗi bước có ví dụ điền thật lấy từ `Criteria-Source/*.pdf`. Hình trong `public/guide-img/` là ảnh
 * chụp từ chính hai file PDF đó.
 */

export interface GuideCallout {
  kind: 'tip' | 'warn';
  text: string;
}

/** Ảnh tĩnh trong `public/` — đường dẫn tuyệt đối từ gốc site, ví dụ `/guide-img/x.png`. */
export interface GuideFigure {
  src: string;
  alt: string;
  caption?: string;
}

/** Một khung "gõ đúng như thế này" — giữ nguyên xuống dòng. */
export interface GuideExample {
  title: string;
  text: string;
}

export interface GuideStep {
  title: string;
  body: string[];
  /** Khóa i18n của nhãn/nút thật, render thành "chip" để giáo viên đối chiếu với màn hình. */
  uiKeys?: string[];
  figures?: GuideFigure[];
  example?: GuideExample;
  callout?: GuideCallout;
}

export interface GuideTerm {
  term: string;
  desc: string;
}

export interface GuideSection {
  heading: string;
  intro?: string[];
  figures?: GuideFigure[];
  terms?: GuideTerm[];
  steps?: GuideStep[];
  example?: GuideExample;
  callout?: GuideCallout;
}

/** Pilot 09-15: 3 tab theo việc giáo viên làm. */
export const GUIDE_TAB_IDS = ['features', 'criteria', 'grading'] as const;
export type GuideTabId = (typeof GUIDE_TAB_IDS)[number];

export interface GuideContent {
  title: string;
  lead: string;
  tocHeading: string;
  tabs: Record<GuideTabId, { label: string; intro: string }>;
  sections: {
    overview: GuideSection;
    pages: GuideSection;
    concepts: GuideSection;
    who: GuideSection;
    content: GuideSection;
    structure: GuideSection;
    criteriaTrouble: GuideSection;
    after: GuideSection;
    wordLabels: GuideSection;
    gradingTrouble: GuideSection;
  };
}

export type GuideSectionId = keyof GuideContent['sections'];

/** Tab nào chứa mục nào, theo thứ tự hiển thị — dùng chung cho mục lục lẫn thân trang. */
export const GUIDE_TABS: Record<GuideTabId, readonly GuideSectionId[]> = {
  features: ['overview', 'pages'],
  criteria: ['concepts', 'who', 'content', 'structure', 'criteriaTrouble'],
  grading: ['after', 'wordLabels', 'gradingTrouble'],
};

const IMG = {
  ylScale1: '/guide-img/yl-thang-diem-1.png',
  ylScale2: '/guide-img/yl-thang-diem-2.png',
  ylComments: '/guide-img/yl-nhan-xet-mau.png',
  ieltsBand: '/guide-img/ielts-band-fluency.png',
  ieltsSheet: '/guide-img/ielts-bang-chua-bai.png',
};

export const guideVi: GuideContent = {
  title: 'Hướng dẫn cho đội học thuật',
  lead: 'Trang này dành cho giáo viên: đọc bộ tiêu chí, soạn tiêu chí cho khóa học, rồi duyệt nhận xét và gửi cho học viên. Mọi ví dụ đều lấy từ hai file rubric của trung tâm (Rubric Speaking A0–C và Analytic Scoring Band). Không cần biết kỹ thuật — cứ làm theo thứ tự.',
  tocHeading: 'Nội dung',
  tabs: {
    features: { label: 'Chức năng', intro: 'Hệ thống làm gì, và mỗi mục trên thanh bên trái dùng để làm gì.' },
    criteria: { label: 'Tạo tiêu chí', intro: 'Đọc, chỉnh và dựng bộ tiêu chí chấm điểm cho khóa học và lớp — kèm ví dụ điền thật từ file rubric của trung tâm.' },
    grading: { label: 'Chấm bài', intro: 'Nghe bài, sửa nhận xét, xử lý từ phát âm sai, rồi gửi cho học viên.' },
  },

  sections: {
    overview: {
      heading: 'Toàn cảnh trong một phút',
      intro: [
        'Học viên gửi bài nói qua Zalo. AI nghe và chấm theo bộ tiêu chí của khóa học. Giáo viên đọc lại, sửa nếu cần, rồi bấm gửi. Học viên nhận nhận xét qua Zalo.',
      ],
      terms: [
        { term: 'Bước 1 — Học viên gửi bài', desc: 'Học viên gửi file ghi âm vào Zalo OA của trung tâm. Hệ thống tự nhận, không ai phải bấm gì.' },
        { term: 'Bước 2 — AI chấm', desc: 'AI chấm theo bộ tiêu chí của khóa học mà học viên đang học. AI chấm sát hay không phụ thuộc vào việc bộ tiêu chí viết rõ đến đâu — đó là phần việc của đội học thuật (tab Tạo tiêu chí).' },
        { term: 'Bước 3 — Giáo viên duyệt', desc: 'Bài chấm xong nằm chờ ở màn Bài nộp. Giáo viên nghe lại, đọc nhận xét, sửa nếu cần (tab Chấm bài).' },
        { term: 'Bước 4 — Gửi cho học viên', desc: 'Giáo viên bấm "Gửi cho học viên". Nhận xét đi theo đúng khung "Bảng chấm chữa bài Speaking" của trung tâm: với mỗi tiêu chí có Nhận xét và Hướng sửa bài.' },
      ],
      figures: [
        {
          src: IMG.ieltsSheet,
          alt: 'Bảng chấm chữa bài Speaking: mỗi tiêu chí có cột Nhận xét và cột Hướng sửa bài',
          caption: 'Khung nhận xét của trung tâm (trang cuối file Analytic Scoring Band). Tin nhắn học viên nhận được đi theo đúng khung này.',
        },
      ],
      callout: {
        kind: 'tip',
        text: 'Học viên KHÔNG nhận điểm số — chỉ nhận nhận xét và hướng sửa. Điểm từng tiêu chí chỉ giáo viên thấy trên màn Bài nộp.',
      },
    },

    pages: {
      heading: 'Các mục trên thanh bên trái',
      intro: ['Dưới đây là các mục giáo viên dùng. Màn hình của bạn không có mục nào thì mục đó dành cho quản trị viên — không ảnh hưởng việc chấm bài.'],
      terms: [
        {
          term: 'Onboarding — Tài khoản chờ kích hoạt',
          desc: 'Học viên nhắn Zalo OA của trung tâm lần đầu sẽ hiện ở đây. Nhập số điện thoại học viên đã đăng ký ở trung tâm rồi bấm "Kích hoạt" để gắn Zalo đó với đúng học viên. Chưa kích hoạt thì bài học viên gửi lên chưa được chấm.',
        },
        {
          term: 'Học viên',
          desc: 'Danh sách học viên: mã, họ tên, số điện thoại, lớp, khóa học. Tìm theo mã, tên hoặc SĐT. Học viên phải có lớp và khóa học đúng thì bài mới được chấm theo đúng bộ tiêu chí.',
        },
        {
          term: 'Bài nộp',
          desc: 'Mọi bài học viên đã gửi. Lọc theo trạng thái, lớp, ngày; bấm "Xem" để nghe, sửa nhận xét và gửi cho học viên — chi tiết ở tab Chấm bài.',
        },
        {
          term: 'Tiêu chí',
          desc: 'Ba tab: "Khóa & phiên bản" — mỗi khóa đang chấm bằng phiên bản tiêu chí nào; "Cấu hình theo lớp" — lớp nào dùng bộ nào, và bài đọc của lớp thiếu nhi; "Tiêu chí & Prompt" — các cấu trúc chấm điểm và đoạn văn AI nhận. Chi tiết ở tab Tạo tiêu chí.',
        },
        {
          term: 'Báo cáo',
          desc: 'Tỷ lệ nộp bài theo lớp trong khoảng ngày bạn chọn; xuất ra CSV hoặc Excel.',
        },
        {
          term: 'Phân tích',
          desc: 'Số bài nộp, số bài đang chờ duyệt, điểm trung bình theo lớp và theo từng tiêu chí — để thấy lớp nào, tiêu chí nào cần chú ý.',
        },
        { term: 'Hướng dẫn', desc: 'Trang này. Mỗi tab ứng với một việc: Chức năng · Tạo tiêu chí · Chấm bài.' },
      ],
      callout: {
        kind: 'tip',
        text: 'Trên màn Tiêu chí không thấy nút "Sửa" hay "Soạn nội dung chấm điểm"? Tài khoản chưa được cấp quyền — xem cuối mục "Lớp của tôi đang chấm bằng bộ tiêu chí nào?" trong tab Tạo tiêu chí.',
      },
    },

    concepts: {
      heading: 'Đọc hiểu một bộ tiêu chí — qua chính file của trung tâm',
      intro: [
        'Một bộ tiêu chí chính là bảng chấm điểm mà giáo viên vẫn dùng. Hệ thống chỉ cần ba thứ từ bảng đó: có những tiêu chí nào, thang điểm từ mấy đến mấy, và mỗi mức điểm nghĩa là gì.',
        'Ví dụ file Rubric Speaking A0–A2 (lớp KID): mỗi HÀNG là một tiêu chí, mỗi CỘT là một mức điểm từ 0 đến 5.',
      ],
      figures: [
        {
          src: IMG.ylScale1,
          alt: 'Bảng Rubric Speaking A0–A2: tiêu chí Pronunciation và Intonation, cột 0 đến 5 điểm',
          caption: 'Rubric Speaking A0–A2 — tiêu chí 1–2. Hàng = tiêu chí, cột = mức điểm, ô = mô tả mức đó.',
        },
        {
          src: IMG.ylScale2,
          alt: 'Bảng Rubric Speaking A0–A2: tiêu chí Ending sounds, Word Stress, Fluency',
          caption: 'Rubric Speaking A0–A2 — tiêu chí 3–5.',
        },
      ],
      terms: [
        { term: 'Tiêu chí', desc: 'Một khía cạnh được chấm. Lớp KID có 5: Pronunciation, Intonation, Ending sounds, Word Stress, Fluency. IELTS có 4: Fluency and coherence, Lexical resources, Grammatical range and accuracy, Pronunciation.' },
        { term: 'Thang điểm', desc: 'Lớp KID: 0 đến 5 điểm mỗi tiêu chí. IELTS: band 0 đến 9.' },
        { term: 'Mô tả mức điểm', desc: 'Chữ trong từng ô của bảng. Ví dụ Pronunciation 3 điểm: "Phát âm đúng đa số từ quen thuộc, đôi lúc gây nhầm." AI dựa vào những câu này để quyết định cho mấy điểm.' },
        { term: 'Cách tính tổng', desc: 'Lớp KID CỘNG 5 tiêu chí (tối đa 25 điểm) rồi quy ra cấp độ: 0–10 Pre-starter (Tiny Rabbit), 11–15 Starter (Little Fox), 16–20 Mover (Junior Panda), 21–25 Flyer (Great Big Dino). IELTS lấy TRUNG BÌNH 4 tiêu chí, không có số lẻ.' },
      ],
      steps: [
        {
          title: 'IELTS viết mỗi band thành nhiều gạch đầu dòng',
          body: [
            'File Analytic Scoring Band không viết một câu cho mỗi mức mà liệt kê nhiều ý. Hệ thống giữ nguyên cách đó: mỗi ý là một dòng.',
          ],
          figures: [
            {
              src: IMG.ieltsBand,
              alt: 'Bảng band Fluency and coherence: band 9, 8, 7 mỗi band nhiều gạch đầu dòng',
              caption: 'Analytic Scoring Band — Fluency and coherence, band 9 đến 7.',
            },
          ],
        },
      ],
      callout: {
        kind: 'tip',
        text: 'Cả hai file này ĐÃ ĐƯỢC NẠP SẴN vào hệ thống cho 22 khóa học: khóa thiếu nhi (Tiny Rabbit, Little Fox, Junior Panda, Great Big Dino) dùng bảng Cambridge, các khóa còn lại dùng bảng IELTS. Việc của đội học thuật là kiểm tra và chỉnh cho sát — không phải gõ lại từ đầu.',
      },
    },

    who: {
      heading: 'Lớp của tôi đang chấm bằng bộ tiêu chí nào?',
      intro: ['Trước khi kiểm thử một lớp, hãy xem lớp đó đang dùng bộ nào.'],
      steps: [
        {
          title: 'Mở bảng Cấu hình theo lớp',
          body: ['Vào Tiêu chí ở thanh bên trái, chọn tab "Cấu hình theo lớp". Bảng liệt kê mọi lớp đang có học viên.'],
          uiKeys: ['nav.criteria', 'criteria.classesConfig'],
        },
        {
          title: 'Đọc cột "Tiêu chí đang áp dụng"',
          body: [
            'Cột này ghi tên bộ tiêu chí và phiên bản (ví dụ "Tiny Rabbit — Speaking (Cambridge YL) · v3"), kèm một nhãn:',
            '• "Theo khóa": lớp dùng phiên bản mới nhất của khóa học. Đây là trường hợp bình thường.',
            '• "Ghim riêng": lớp được chỉ định dùng một phiên bản cụ thể, kể cả khi khóa đã có phiên bản mới hơn.',
            'Nhãn màu vàng là cảnh báo cần xử lý — ví dụ "Khóa chưa có tiêu chí" nghĩa là bài của lớp đó sẽ không được chấm.',
          ],
          uiKeys: ['criteria.effectiveCriteria', 'criteria.sourceCourseLatest', 'criteria.sourcePinned'],
        },
        {
          title: 'Muốn một lớp dùng phiên bản khác (tùy chọn)',
          body: [
            'Ở cột "Ghim tiêu chí", chọn phiên bản muốn dùng rồi bấm Lưu trên hàng đó. Chọn lại "Mặc định" để quay về phiên bản mới nhất của khóa. Ô Zalo ID tư vấn có thể để trống.',
          ],
          uiKeys: ['criteria.pinCriteria', 'criteria.save'],
        },
        {
          title: 'Lớp thiếu nhi: nhập bài đọc hiện tại',
          body: [
            'Vì sao cần: có bài đọc, Azure đối chiếu từng từ học viên nói với văn bản nên chấm phát âm chính xác, và biết học viên có đọc đủ bài không. Không có, Azure phải tự đoán trẻ nói gì — với giọng trẻ em nó hay đoán sai (đã đo: nghe "the ladder" thành "tornado"), bài bị gắn nhãn vàng để giáo viên nghe kỹ.',
            'Cách làm: trong bảng Cấu hình theo lớp, ở cột "Ghim tiêu chí" của lớp cần nhập, bấm nút "Nhập bài đọc". Một cửa sổ lớn mở ra.',
            'Dán đoạn văn học viên phải đọc trong bài tập hiện tại vào ô soạn. Bên dưới hiện số từ để bạn soát nhanh đã dán đủ chưa. Bấm Lưu — bài đọc được lưu ngay, không cần bấm thêm nút Lưu trên hàng.',
            'Sau khi lưu, trên hàng lớp hiện 2 dòng đầu của bài đọc và nút đổi thành "Sửa bài đọc (… từ)". Sang bài mới thì bấm nút đó, xóa đoạn cũ, dán đoạn mới, Lưu. Lớp chuyển sang nói tự do thì bấm "Xóa bài đọc".',
            'Dán ĐÚNG những gì học viên đọc thành tiếng: giữ tiêu đề nếu học viên đọc cả tiêu đề; bỏ phần hướng dẫn, số trang, chú thích hình mà học viên không đọc. Mỗi lớp chỉ có MỘT bài đọc hiện tại — nhiều lớp đọc cùng bài thì nhập cho từng lớp.',
            'Lớp IELTS nói tự do theo chủ đề thì KHÔNG cần bài đọc.',
          ],
          uiKeys: ['criteria.readingTextAdd', 'criteria.save', 'criteria.readingTextClear'],
          callout: {
            kind: 'warn',
            text: 'Bài đọc áp dụng cho bài nộp TỪ LÚC LƯU trở đi. Nhớ đổi bài đọc TRƯỚC khi giao bài mới — nếu quên, bài nộp mới sẽ bị chấm theo văn bản cũ và điểm "đọc đủ bài" sẽ thấp bất thường.',
          },
          example: {
            title: 'Ví dụ — bài đọc của lớp Tiny Rabbit',
            text: 'Playground. Written by Elizabeth Jane Pustilnik. What can you do at the playground? The gate. The swing. The slide. The sandbox. The ladder. The bridge.',
          },
        },
      ],
      callout: {
        kind: 'warn',
        text: 'Không thấy nút Soạn nội dung chấm điểm hoặc Cấu trúc chấm điểm? Tài khoản chưa được cấp quyền. Nhờ quản trị viên vào màn Người dùng tích quyền "criteria_author" (soạn nội dung) hoặc "rubric_template" (dựng cấu trúc) — có hiệu lực ngay.',
      },
    },

    content: {
      heading: 'Chỉnh bộ tiêu chí cho một khóa — điền gì vào ô nào',
      intro: [
        'Đây là việc đội học thuật làm thường xuyên nhất. Cách an toàn nhất là SỬA phiên bản đang dùng, vì nó đã có đầy đủ mô tả từ file của trung tâm. Mỗi lần lưu tạo ra một phiên bản mới; phiên bản cũ vẫn còn nguyên.',
      ],
      steps: [
        {
          title: 'Mở phiên bản đang dùng',
          body: [
            'Vào Tiêu chí, tab "Khóa & phiên bản" (tab mở sẵn). Tìm hàng của khóa học (ví dụ "Little Fox"): cột "Phiên bản đang áp dụng" cho biết khóa đang chấm bằng phiên bản nào. Bấm "Xem nội dung" để đọc lại trước, rồi bấm "Sửa".',
          ],
          uiKeys: ['nav.criteria', 'criteria.tab.courses', 'criteria.view', 'templates.edit'],
          callout: {
            kind: 'warn',
            text: 'Tránh bấm "Soạn nội dung chấm điểm" rồi chọn cấu trúc để làm từ đầu: cấu trúc mặc định chỉ có khung, phần mô tả mức điểm gần như trống, bạn sẽ phải gõ lại toàn bộ.',
          },
        },
        {
          title: 'Kiểm tra mô tả từng mức điểm — phần quan trọng nhất',
          body: [
            'Mỗi tiêu chí có một ô cho mỗi mức điểm: thang 0–5 có 6 ô, thang 0–9 có 10 ô. Đối chiếu từng ô với bảng trong file rubric.',
            'Mỗi lần xuống dòng trong ô là một gạch đầu dòng. Viết càng cụ thể, AI càng chấm sát: "Phát âm khá rõ, lỗi nhỏ không ảnh hưởng hiểu" tốt hơn nhiều so với "Tạm được".',
          ],
          uiKeys: ['authoring.bands'],
          example: {
            title: 'Ví dụ — Pronunciation (Âm chính), lớp KID, lấy từ Rubric Speaking A0–A2',
            text:
              'Mức 0: Không phát âm được, khó hiểu.\n' +
              'Mức 1: Phát âm rời rạc, sai nhiều âm, khó nhận diện từ.\n' +
              'Mức 2: Có thể phát âm từ quen thuộc nhưng nhiều sai sót.\n' +
              'Mức 3: Phát âm đúng đa số từ quen thuộc, đôi lúc gây nhầm.\n' +
              'Mức 4: Phát âm khá rõ, lỗi nhỏ không ảnh hưởng hiểu.\n' +
              'Mức 5: Phát âm rõ ràng, dễ hiểu, gần chuẩn người bản ngữ.',
          },
        },
        {
          title: 'Với IELTS: mỗi ý một dòng',
          body: ['Ô của một band IELTS thường có nhiều ý — gõ mỗi ý trên một dòng riêng, đúng như gạch đầu dòng trong file.'],
          example: {
            title: 'Ví dụ — Fluency and coherence, ô "Mức 8", lấy từ Analytic Scoring Band',
            text:
              'Nói một cách trôi chảy, hiếm khi lặp lại hoặc tự sửa lỗi\n' +
              'Ngập ngừng chủ yếu do tìm nội dung, ý diễn đạt, ít khi phải dừng để tìm từ ngữ hay ngữ pháp\n' +
              'Phát triển các chủ đề một cách mạch lạc và phù hợp',
          },
        },
        {
          title: 'Yếu tố con — là gì, điền thế nào, khi nào dùng (tùy chọn)',
          body: [
            'Yếu tố con chia MỘT tiêu chí thành vài khía cạnh nhỏ, và ghi TỪ KHÓA NGẮN cho từng mức điểm. Mục đích duy nhất: giúp AI phân biệt hai mức điểm sát nhau, ví dụ band 6 với band 7.',
            '• KHÔNG tạo thêm điểm: tiêu chí vẫn chỉ có một điểm. Yếu tố con chỉ là ghi chú tham khảo cho AI khi chấm tiêu chí đó.',
            '• Học viên KHÔNG thấy phần này.',
            '• Để trống cũng được: yếu tố con không có nội dung sẽ tự bị bỏ đi khi Lưu.',
            'Cách điền: ngay dưới phần "Mô tả từng mức điểm" của tiêu chí, bấm "Thêm yếu tố con". Mỗi yếu tố con có một ô "Tên yếu tố con" và một ô nhỏ cho mỗi mức điểm. Ô rất nhỏ — chỉ gõ vài chữ khóa. Mức nào không cần thì để trống.',
            'Lấy nội dung ở đâu: file Analytic Scoring Band có sẵn bảng so sánh band 4–8 cho từng tiêu chí IELTS (ảnh bên dưới). Mỗi HÀNG của bảng là một yếu tố con, mỗi CỘT band là một ô.',
          ],
          uiKeys: ['authoring.subFactors', 'authoring.addSubFactor', 'authoring.subFactorLabel'],
          figures: [
            {
              src: '/guide-img/ielts-yeu-to-con.png',
              alt: 'Bảng so sánh band 4 đến 8 của Fluency and coherence: độ dài và tốc độ, độ ngập ngừng, độ lặp và tự sửa lỗi, phép nối, độ mạch lạc',
              caption: 'Analytic Scoring Band — bảng so sánh band 4–8 của Fluency and coherence. Mỗi hàng là một yếu tố con.',
            },
          ],
          example: {
            title: 'Ví dụ — 3 yếu tố con cho Fluency and coherence, chép từ bảng trên',
            text:
              'Yếu tố con 1 — Tên: Độ dài, tốc độ nói\n' +
              '   Band 4: Speak slowly · Band 5: Slow speech · Band 6: Willing to speak at length · Band 7: Speak at length without effort · Band 8: Speak fluently\n\n' +
              'Yếu tố con 2 — Tên: Ngập ngừng\n' +
              '   Band 4: Frequent · Band 5: Search for basic lexis · Band 6: Occasionally · Band 7: Language-related at times · Band 8: Content-related, rarely language\n\n' +
              'Yếu tố con 3 — Tên: Từ nối\n' +
              '   Band 4: Repetitive simple connectives · Band 5: Overuse of certain connectives · Band 6: A range, not always appropriate · Band 7: A range, flexibly · Band 8: A range, flexibly\n\n' +
              '(Các ô band 0–3 và 9 để trống.)',
          },
          callout: {
            kind: 'tip',
            text: 'Khi nào dùng: lớp thiếu nhi (Cambridge) CHƯA cần — mô tả 0–5 điểm đã đủ rõ. Với IELTS, chỉ thêm khi thấy AI chấm lệch lặp lại giữa hai band liền nhau (giáo viên cho 6, AI liên tục cho 7), và chỉ thêm cho ĐÚNG tiêu chí bị lệch — rồi chấm thử lại bằng Test Upload. Đừng điền cho mọi tiêu chí ngay từ đầu: nhiều chữ hơn không làm AI chấm sát hơn.',
          },
        },
        {
          title: 'Nạp câu nhận xét mẫu để AI viết giống giáo viên',
          body: [
            'Ở Kho nhận xét, bấm Thêm nhận xét, dán một câu giáo viên vẫn hay viết, chọn nó thuộc tiêu chí nào và ý định là khen hay góp ý. Chỗ tên học viên hoặc từ cụ thể cứ để "…".',
            'AI bắt chước giọng văn của những câu này. Nên có ít nhất một câu khen và một câu góp ý cho mỗi tiêu chí hay gặp.',
          ],
          uiKeys: ['authoring.commentBank', 'authoring.addComment', 'authoring.cbDimension', 'authoring.cbIntent'],
          figures: [
            {
              src: IMG.ylComments,
              alt: 'Trang CMT LỚP KIDS-TEEN: các câu nhận xét mẫu theo Ngữ điệu, Khen, Âm đuôi, Pronunciation',
              caption: 'Nguồn câu mẫu: trang "CMT LỚP KIDS-TEEN" trong file Rubric Speaking A0–C. Mỗi đoạn có dấu "+" là một câu mẫu.',
            },
          ],
          example: {
            title: 'Ví dụ — một câu mẫu điền vào Kho nhận xét',
            text:
              'Tiêu chí: Ending sounds (Âm đuôi)\n' +
              'Ý định: khen\n' +
              'Nội dung: Cô cũng nhận được bài của … rui nha, cô thấy con cũng rất để ý đến âm đuôi, cái này sẽ khá hữu ích khi sau này học nhiều từ phức tạp hơn. Mong con tiếp tục phát huy điểm mạnh nha con.',
          },
        },
        {
          title: 'Đọc thử phần xem trước rồi lưu',
          body: [
            'Khung Xem trước prompt gửi AI hiện đúng đoạn văn AI sẽ nhận. Đọc lướt một lượt: bạn thấy khó hiểu thì AI cũng vậy.',
            'Bấm Lưu. Hệ thống báo "Đã lưu phiên bản …". Từ lúc này, bài nộp mới của khóa sẽ chấm theo phiên bản vừa lưu (trừ lớp đang Ghim riêng phiên bản cũ).',
          ],
          uiKeys: ['authoring.preview', 'criteria.save'],
        },
        {
          title: 'Chấm thử trước khi dùng thật',
          body: [
            'Mục Test Upload chỉ quản trị viên thấy — nhờ quản trị viên làm cùng: chọn một học viên thử (ví dụ lớp PILOT-TEST) và tải lên một file ghi âm. Bài được chấm như thật nhưng KHÔNG gửi cho ai — mở màn Bài nộp để xem AI cho điểm và nhận xét có sát với cách giáo viên chấm không.',
          ],
          uiKeys: ['nav.testUpload', 'nav.submissions'],
        },
      ],
      callout: {
        kind: 'tip',
        text: 'Sửa bộ tiêu chí không làm đổi điểm các bài đã chấm — mỗi bài giữ phiên bản tiêu chí của lúc nó được chấm.',
      },
    },

    structure: {
      heading: 'Dựng một bộ tiêu chí hoàn toàn mới',
      intro: [
        'Chỉ cần khi trung tâm có chương trình mới với thang điểm hoặc bộ tiêu chí khác hẳn Cambridge và IELTS. Việc này cần quyền "rubric_template" và thường do trưởng bộ môn làm. Ví dụ dưới đây dựng lại đúng bảng Rubric Speaking A0–A2 để thấy từng ô điền gì.',
      ],
      steps: [
        {
          title: 'Nhân bản một cấu trúc có sẵn',
          body: [
            'Vào Tiêu chí, tab "Tiêu chí & Prompt": bảng "Cấu trúc chấm điểm hiện có" cho thấy các khung đang có và bao nhiêu khóa đang dùng mỗi khung. Bấm Cấu trúc chấm điểm, tìm cấu trúc gần giống nhất rồi bấm Nhân bản — nhanh và ít sai hơn tạo mới. Đặt Khóa mới là mã ngắn không dấu, không đổi được về sau (ví dụ "kid_speaking_2027").',
          ],
          uiKeys: ['templates.open', 'templates.duplicate', 'templates.new'],
        },
        {
          title: 'Điền thang điểm và cách tính',
          body: ['Lấy từ phần "Cách tính" trong file rubric.'],
          uiKeys: ['templates.scale', 'templates.aggregationMethod'],
          example: {
            title: 'Ví dụ — lớp KID (Rubric Speaking A0–A2)',
            text:
              'Thang điểm: Nhỏ nhất 0 · Lớn nhất 5 · Bước nhảy 1\n' +
              'Cách tính tổng: Tổng (sum) → ô "Tổng điểm tối đa" hiện 25\n\n' +
              'Nếu là IELTS: Nhỏ nhất 0 · Lớn nhất 9 · Bước nhảy 1 · Cách tính: Trung bình (average) · Làm tròn: số nguyên',
          },
        },
        {
          title: 'Khai báo tiêu chí',
          body: [
            'Mỗi hàng của bảng rubric là một tiêu chí. "Khóa tiêu chí" là tên máy (chữ thường, không dấu, nối bằng gạch dưới); "Nhãn hiển thị" là tên giáo viên đọc.',
            'Bắt buộc có một tiêu chí khóa "pronunciation".',
          ],
          uiKeys: ['templates.addDimension', 'templates.dimKey', 'templates.dimLabel'],
          example: {
            title: 'Ví dụ — 5 tiêu chí lớp KID',
            text:
              'pronunciation — Pronunciation (Âm chính)\n' +
              'intonation — Intonation (Ngữ điệu)\n' +
              'ending_sounds — Ending sounds (Âm đuôi)\n' +
              'word_stress — Word Stress (Trọng âm từ/cụm)\n' +
              'fluency — Fluency (Trôi chảy)',
          },
        },
        {
          title: 'Lập bảng cấp độ (nếu file có quy đổi)',
          body: ['Các khoảng phải nối liền nhau và phủ kín từ 0 tới tổng tối đa. Không cần quy đổi thì để trống (như IELTS).'],
          uiKeys: ['templates.levels', 'templates.addLevel'],
          example: {
            title: 'Ví dụ — quy đổi lớp KID',
            text:
              '0–10 · A0 · Pre-starter (A0) ~ Tiny Rabbit\n' +
              '11–15 · A1- · Starter (A1-) ~ Little Fox\n' +
              '16–20 · A1 · Mover (A1) ~ Junior Panda\n' +
              '21–25 · A2 · Flyer (A2) ~ Great Big Dino',
          },
        },
        {
          title: 'Chọn đầu ra và mẫu tin gửi học viên',
          body: [
            'Đầu ra: tích cả Nhận xét và Hướng sửa để tin nhắn có đủ hai cột như "Bảng chấm chữa bài Speaking".',
            'Mẫu văn bản phản hồi quyết định tin nhắn học viên nhận. Giữ nguyên mẫu dưới đây — chữ trong ngoặc nhọn kép được hệ thống tự thay bằng nội dung thật.',
          ],
          uiKeys: ['templates.outputFields', 'templates.outputFix', 'templates.replyTemplate'],
          example: {
            title: 'Mẫu văn bản phản hồi (gõ đúng như sau)',
            text: '{{feedback}}\n\n{{criteria}}\n\nEm chú ý phát âm các từ sau:\n{{pronunciation_errors}}',
          },
          callout: {
            kind: 'warn',
            text: 'Không bật "Hiện tổng điểm" hay "Hiện cấp độ": trung tâm không gửi điểm số cho học viên.',
          },
        },
        {
          title: 'Lưu cấu trúc, rồi soạn nội dung',
          body: ['Lưu cấu trúc xong, làm tiếp như mục "Chỉnh bộ tiêu chí cho một khóa": điền mô tả từng mức điểm và câu nhận xét mẫu cho từng khóa học dùng cấu trúc này.'],
        },
      ],
      callout: {
        kind: 'warn',
        text: 'Hai cấu trúc mặc định (Cambridge và IELTS) không xóa được. Nút "Khôi phục bản gốc" đưa chúng về nguyên trạng ban đầu và XÓA mẫu văn bản phản hồi — sau khi khôi phục, nhờ quản trị viên điền lại mẫu ở bước trên.',
      },
    },

    after: {
      heading: 'Duyệt bài và gửi nhận xét cho học viên',
      intro: ['Bài chấm xong không tự gửi — giáo viên đọc lại rồi mới gửi.'],
      steps: [
        {
          title: 'Mở bài cần duyệt',
          body: ['Vào Bài nộp, lọc Trạng thái là "awaiting_review" (chờ duyệt) hoặc tìm theo tên học viên, rồi bấm Xem.'],
          uiKeys: ['nav.submissions', 'submissions.filterStatus', 'submissions.view'],
        },
        {
          title: 'Nghe bài và xem số liệu đo',
          body: [
            'Nghe file ghi âm. Khi hệ thống đã bật Azure, khung "Số liệu đo bằng Azure" hiện điểm 0–100 đo từ giọng nói: độ chính xác, trôi chảy, ngữ điệu, âm đuôi, trọng âm — và lời nói Azure nhận dạng được.',
            'Điểm các tiêu chí đo được bằng giọng nói (phát âm, ngữ điệu, âm đuôi, trọng âm, trôi chảy) là do Azure đo, lần nào chấm lại cũng ra đúng số đó. Nhận xét và hướng sửa do Gemini viết dựa trên số đo. Với IELTS, Từ vựng, Ngữ pháp và phần Mạch lạc vẫn do Gemini chấm.',
            'Nhãn vàng "Nói tự do (không có bài đọc)" ở lớp thiếu nhi nghĩa là lớp chưa nhập bài đọc: điểm phát âm kém tin cậy, nghe kỹ trước khi gửi và nhập bài đọc cho lớp (tab Tạo tiêu chí → "Lớp của tôi đang chấm bằng bộ tiêu chí nào?").',
          ],
          uiKeys: ['submissions.azureTitle', 'submissions.azureModeScripted', 'submissions.azureModeUnscripted'],
        },
        {
          title: 'Sửa trực tiếp mọi thứ học viên sẽ nhận',
          body: [
            'Sửa được tất cả: nhận xét chung ở đầu tin, điểm từng tiêu chí, nhận xét, hướng sửa, và gợi ý cho từng từ phát âm sai.',
            'Nghe lại một từ (bấm ▶ cạnh từ) mà thấy học viên đọc ĐÚNG — máy đánh dấu nhầm — thì bấm "Gắn sai" cạnh từ đó. Chỉ RIÊNG từ đó bị bỏ khỏi tin gửi học viên; các từ khác, điểm và nhận xét giữ nguyên. Bản AI vẫn được lưu. Từ có nhãn "Cần giáo viên nghe lại" là từ nên nghe trước.',
            'Nghe thấy học viên đọc sai một từ mà máy KHÔNG đánh dấu: dừng audio đúng chỗ đó, bấm "+ Thêm từ AI bỏ sót", gõ từ và hướng sửa.',
            'Khi bấm Gửi, hệ thống ghi lại từ nào bạn giữ, gắn sai hay thêm để đánh giá độ chính xác của máy chấm. Hãy gắn sai và thêm từ đúng như bạn nghe — đừng giữ một từ chỉ vì máy đã đánh dấu.',
            'Điểm bạn sửa khác điểm AI thì cạnh ô hiện nhãn "AI: …" để đối chiếu. Bản gốc của AI luôn được giữ lại — dùng để đo AI lệch giáo viên bao nhiêu.',
            'Học viên KHÔNG nhận điểm số: điểm chỉ dùng cho báo cáo. Nếu điểm hay nhận xét của một tiêu chí lệch nhiều so với cách bạn chấm, báo người phụ trách bộ tiêu chí (tab Tạo tiêu chí).',
          ],
          uiKeys: [
            'submissions.overallFeedback',
            'submissions.dimensionScore',
            'submissions.comment',
            'submissions.scoreFix',
            'submissions.removeWord',
            'submissions.addWord',
          ],
        },
        {
          title: 'Bấm Gửi cho học viên',
          body: [
            'Gửi tự LƯU bản bạn đang sửa rồi gửi đúng bản đó — không cần bấm Lưu trước. Nút Lưu chỉ dùng khi muốn để dành, gửi sau.',
            'Gửi xong, nút chuyển thành "Đã gửi" và các ô khóa lại — mỗi bài chỉ gửi một lần. Tin dài tự chia thành 2–3 tin liên tiếp trên Zalo.',
          ],
          uiKeys: ['students.save', 'submissions.send', 'submissions.sent'],
          callout: {
            kind: 'warn',
            text: 'Làm việc lâu thì đăng nhập lại trước khi Gửi: phiên đăng nhập hết hạn sau 8 giờ, lúc đó bấm Gửi sẽ báo lỗi và CHƯA có gì được gửi đi.',
          },
        },
      ],
      example: {
        title: 'Học viên nhận được trên Zalo (rút gọn từ một bài thật của lớp PILOT-TEST)',
        text:
          'Thầy/Cô đánh giá cao sự chuẩn bị chu đáo và khả năng mở rộng ý tưởng rất tốt của em trong bài nói này! …\n\n' +
          '🔹 Fluency and coherence\n' +
          'Nhận xét: Em trả lời đầy đủ tất cả các câu hỏi và biết cách kéo dài câu nói bằng cách đưa ra lý do, ví dụ minh họa rõ ràng.\n' +
          '→ Hướng sửa: Hạn chế đọc lại câu hỏi trong đề bài; thay bằng câu dẫn tự nhiên như "Well, to be honest…".\n\n' +
          '🔹 Grammatical range and accuracy\n' +
          'Nhận xét: Em đã kết hợp được cả câu đơn và câu phức, còn một số lỗi hòa hợp chủ ngữ – động từ.\n' +
          '→ Hướng sửa: "it requires" thay vì "it require"; "a musician" thay vì "a musicians".\n\n' +
          'Em chú ý phát âm các từ sau:\n' +
          '• 0:43 — "genres" em đọc thành "jurns" → /ˈʒɑːn.rəz/',
      },
      callout: {
        kind: 'warn',
        text: 'Hãy duyệt và gửi trong vòng 48 giờ kể từ khi học viên nhắn. Quá 48 giờ, Zalo không cho trung tâm nhắn miễn phí và hệ thống sẽ chặn tin — học viên không nhận được gì.',
      },
    },

    wordLabels: {
      heading: 'Đọc các nhãn trên từ phát âm sai',
      intro: [
        'Dưới tiêu chí phát âm là danh sách từ học viên đọc chưa đúng. Cách làm với mỗi từ: bấm ▶ để nghe lại (hệ thống tua lùi 2 giây để bạn nghe cả câu dẫn), rồi quyết định giữ, sửa gợi ý, hay "Gắn sai".',
        'Máy làm hai lượt: Azure đo từng âm và đánh dấu từ sai; sau đó hệ thống cắt riêng đoạn 1–2 giây quanh mỗi từ cho Gemini nghe lại và viết hướng sửa.',
      ],
      terms: [
        {
          term: 'Từ không có nhãn',
          desc: 'Azure đánh dấu sai và Gemini nghe lại đoạn cắt cũng thấy sai (hoặc chưa nghe lại được). Thường là lỗi thật — vẫn nên nghe nếu bạn phân vân.',
        },
        {
          term: 'Nhãn vàng "Cần giáo viên nghe lại"',
          desc: 'Hai máy bất đồng: Azure đánh dấu sai, nhưng Gemini nghe đoạn cắt thấy chấp nhận được. Bạn là người quyết định — nghe ▶: học viên đọc đúng thì bấm "Gắn sai"; đọc sai thì giữ và sửa gợi ý nếu cần. Nghe những từ này trước.',
        },
        {
          term: 'Nhãn "Gemini phát hiện (Azure bỏ sót)"',
          desc: 'Azure chấm từ này là đúng, nhưng Gemini nghe cả bài thấy sai và đã nghe lại đoạn cắt để xác nhận. Nghe lại trước khi giữ.',
        },
        {
          term: 'Nhãn "Giáo viên thêm"',
          desc: 'Từ bạn tự thêm bằng "+ Thêm từ AI bỏ sót". Gõ từ và hướng sửa; từ để trống sẽ tự bị bỏ khi lưu.',
        },
        {
          term: 'Chữ trong ngoặc và "Nghe thành"',
          desc: 'Chữ trong ngoặc sau từ là lỗi cụ thể Gemini nghe được, ví dụ "/θ/ đọc thành /t/" — chỉ giáo viên thấy. "Nghe thành" là cách học viên thực sự đọc, ghi bằng phiên âm. Học viên nhận: mốc giờ, từ, "em đọc thành …" và hướng sửa.',
        },
      ],
      example: {
        title: 'Ví dụ — một dòng học viên nhận trên Zalo',
        text: '• 0:43 — "genres" em đọc thành "jurns" → Em đọc âm đầu /ʒ/ nhẹ, không bật như /dʒ/ nhé.',
      },
      callout: {
        kind: 'warn',
        text: '"Gắn sai" chỉ bỏ từ khỏi tin gửi học viên — KHÔNG tự đổi điểm phát âm. Bỏ nhiều từ đến mức điểm không còn hợp lý thì sửa luôn ô Điểm của tiêu chí đó.',
      },
    },

    gradingTrouble: {
      heading: 'Khi gặp vấn đề lúc chấm bài',
      terms: [
        {
          term: 'Nút "Gửi cho học viên" bị mờ, ghi "Đã gửi"',
          desc: 'Bài này đã được gửi đi rồi. Nếu học viên báo không nhận được, báo quản trị viên kèm tên học viên và giờ gửi — nguyên nhân hay gặp nhất là gửi quá 48 giờ sau khi học viên nhắn.',
        },
        {
          term: 'Bấm Gửi báo lỗi',
          desc: 'Thường do phiên đăng nhập đã hết hạn (8 giờ). Khi đó CHƯA có gì được gửi. Mở tab mới, đăng nhập lại, mở lại bài, kiểm tra các ô còn bản sửa rồi bấm Gửi.',
        },
        {
          term: 'Học viên nói đã gửi bài nhưng không thấy trong Bài nộp',
          desc: 'Zalo của học viên có thể chưa được kích hoạt. Vào Onboarding, tìm tài khoản chờ, nhập số điện thoại của học viên rồi bấm "Kích hoạt"; nhờ học viên gửi lại bài.',
        },
        {
          term: 'Máy đánh dấu sai rất nhiều từ trong một bài',
          desc: 'Hay gặp khi học viên nói tự do hoặc lớp thiếu nhi chưa có bài đọc. Nghe và "Gắn sai" từng từ; nếu là lớp thiếu nhi, nhập bài đọc cho lớp để các bài sau chính xác hơn.',
        },
      ],
    },

    criteriaTrouble: {
      heading: 'Khi gặp vấn đề với tiêu chí',
      terms: [
        {
          term: 'Bảng Cấu hình theo lớp có nhãn vàng "Khóa chưa có tiêu chí"',
          desc: 'Khóa của lớp đó chưa có bộ tiêu chí nào nên bài sẽ không được chấm. Soạn tiêu chí cho khóa đó theo mục "Chỉnh bộ tiêu chí cho một khóa" hoặc báo quản trị viên.',
        },
        {
          term: 'AI cho điểm lệch nhiều so với giáo viên',
          desc: 'Mở phiên bản đang dùng, viết lại mô tả của các mức bị nhầm cho cụ thể hơn, thêm yếu tố con cho tiêu chí đó, rồi nhờ quản trị viên chấm thử lại bằng Test Upload.',
        },
        {
          term: 'Không thấy nút soạn nội dung hoặc cấu trúc',
          desc: 'Tài khoản chưa có quyền — xem cuối mục "Lớp của tôi đang chấm bằng bộ tiêu chí nào?".',
        },
        {
          term: '"Phải có một tiêu chí với khóa pronunciation"',
          desc: 'Cấu trúc thiếu tiêu chí phát âm. Thêm một tiêu chí có khóa đúng là "pronunciation" (chữ thường, không dấu).',
        },
        {
          term: '"Hở khoảng trước cấp độ …"',
          desc: 'Bảng cấp độ bị đứt quãng, ví dụ một cấp kết thúc ở 10 mà cấp sau bắt đầu ở 12. Sửa cho các khoảng nối liền nhau.',
        },
      ],
    },
  },
};

export const guideEn: GuideContent = {
  title: 'Guide for the academic team',
  lead: 'For teachers: read a rubric, adapt it for a course, then review feedback and send it to students. Every example comes from the centre\'s two rubric files (Rubric Speaking A0–C and Analytic Scoring Band).',
  tocHeading: 'Contents',
  tabs: {
    features: { label: 'Features', intro: 'What the system does, and what each item in the left sidebar is for.' },
    criteria: { label: 'Build criteria', intro: 'Read, adapt and build the rubrics used for each course and class — with real examples from the centre\'s rubric files.' },
    grading: { label: 'Grading', intro: 'Listen, edit feedback, handle mispronounced words, and send to the student.' },
  },

  sections: {
    overview: {
      heading: 'The whole flow in one minute',
      intro: ['A student sends a speaking clip on Zalo. The AI grades it against the course rubric. A teacher reviews, edits if needed, and sends. The student receives the feedback on Zalo.'],
      terms: [
        { term: 'Step 1 — Student submits', desc: 'The student sends an audio file to the centre\'s Zalo OA. Nothing to click.' },
        { term: 'Step 2 — AI grades', desc: 'Against the rubric of the student\'s course. How close the AI gets depends on how clearly the rubric is written (Build criteria tab).' },
        { term: 'Step 3 — Teacher reviews', desc: 'Graded work waits on the Submissions screen (Grading tab).' },
        { term: 'Step 4 — Send', desc: 'The message follows the centre\'s "Speaking correction sheet": a comment and a fix for each criterion.' },
      ],
      figures: [
        {
          src: IMG.ieltsSheet,
          alt: 'Speaking correction sheet with Comment and Fix columns per criterion',
          caption: 'The centre\'s correction sheet (last page of Analytic Scoring Band). Student messages follow this layout.',
        },
      ],
      callout: { kind: 'tip', text: 'Students never receive scores — only comments and fixes.' },
    },

    pages: {
      heading: 'Items in the left sidebar',
      intro: ['These are the items teachers use. Anything missing from your screen is for administrators and does not affect grading.'],
      terms: [
        { term: 'Onboarding — Pending accounts', desc: 'A student messaging the centre\'s Zalo OA for the first time appears here. Enter the phone number registered at the centre and click "Activate" to bind that Zalo account to the right student. Until then, their submissions are not graded.' },
        { term: 'Students', desc: 'Code, name, phone, class and course. Search by code, name or phone. A student needs the right class and course to be graded against the right rubric.' },
        { term: 'Submissions', desc: 'Everything students sent. Filter by status, class, date; "View" to listen, edit and send — see the Grading tab.' },
        { term: 'Criteria', desc: 'Three tabs: "Courses & versions" (which rubric version each course uses), "Per-class config" (which rubric each class uses, plus kids\' reading texts) and "Rubrics & prompt" (rubric structures and the text the AI receives). See the Build criteria tab.' },
        { term: 'Reports', desc: 'Submission rate per class for a date range; export to CSV or Excel.' },
        { term: 'Analytics', desc: 'Submissions, pending reviews, average scores per class and per criterion — to spot which class or criterion needs attention.' },
        { term: 'Guide', desc: 'This page. One tab per job: Features · Build criteria · Grading.' },
      ],
      callout: { kind: 'tip', text: 'No "Edit" or authoring buttons on Criteria? Your account lacks a permission — see the end of "Which rubric is my class using?" in the Build criteria tab.' },
    },

    concepts: {
      heading: 'Reading a rubric — using the centre\'s own files',
      intro: ['A rubric is the marking table teachers already use: which criteria, the score range, and what each score means. In Rubric Speaking A0–A2 each ROW is a criterion and each COLUMN a score from 0 to 5.'],
      figures: [
        { src: IMG.ylScale1, alt: 'Rubric Speaking A0–A2, criteria 1–2', caption: 'Rubric Speaking A0–A2 — criteria 1–2.' },
        { src: IMG.ylScale2, alt: 'Rubric Speaking A0–A2, criteria 3–5', caption: 'Rubric Speaking A0–A2 — criteria 3–5.' },
      ],
      terms: [
        { term: 'Criterion', desc: 'KID: Pronunciation, Intonation, Ending sounds, Word Stress, Fluency. IELTS: Fluency and coherence, Lexical resources, Grammatical range and accuracy, Pronunciation.' },
        { term: 'Scale', desc: 'KID 0–5 per criterion; IELTS band 0–9.' },
        { term: 'Band description', desc: 'The text in each cell, e.g. Pronunciation 3: "Phát âm đúng đa số từ quen thuộc, đôi lúc gây nhầm."' },
        { term: 'Total', desc: 'KID sums to 25 and maps to a level (0–10 A0 … 21–25 A2). IELTS averages the four criteria with no half bands.' },
      ],
      steps: [
        {
          title: 'IELTS bands are bullet lists',
          body: ['Each band lists several points; the system keeps one point per line.'],
          figures: [{ src: IMG.ieltsBand, alt: 'Fluency and coherence bands 9 to 7', caption: 'Analytic Scoring Band — Fluency and coherence, bands 9–7.' }],
        },
      ],
      callout: { kind: 'tip', text: 'Both files are already loaded for all 22 courses: kids courses use Cambridge, the rest IELTS. The job is to check and refine, not retype.' },
    },

    who: {
      heading: 'Which rubric is my class using?',
      steps: [
        { title: 'Open the per-class table', body: ['Criteria → the "Per-class config" tab. It lists every class with students.'], uiKeys: ['nav.criteria', 'criteria.tab.classes'] },
        {
          title: 'Read "Criteria in use"',
          body: ['Shows the rubric title and version with a badge: "Course default" (latest version of the course) or "Pinned" (a fixed version). Yellow badges need action.'],
          uiKeys: ['criteria.effectiveCriteria', 'criteria.sourceCourseLatest', 'criteria.sourcePinned'],
        },
        { title: 'Pin another version (optional)', body: ['Pick a version under "Pin criteria" and click Save on that row. The advisor Zalo ID may stay empty.'], uiKeys: ['criteria.pinCriteria', 'criteria.save'] },
        {
          title: 'Kids classes: add the current reading text',
          body: [
            'Why: with the text, Azure aligns every spoken word to it — accurate pronunciation scores and a completeness check. Without it Azure guesses what the child said, often wrongly (measured: "the ladder" heard as "tornado"), and the submission gets a yellow flag.',
            'How: in the per-class table, click "Add reading text" under "Pin criteria". A large window opens; paste the passage the students read, check the word count, click Save — it is saved immediately.',
            'Afterwards the row shows the first two lines and the button becomes "Edit reading text (… words)". New assignment: edit, replace, Save. Free speech again: "Clear reading text".',
            'Paste exactly what is read aloud — keep the title if they read it, drop instructions and page numbers. One current text per class. IELTS free-speech classes do not need one.',
          ],
          uiKeys: ['criteria.readingTextAdd', 'criteria.save', 'criteria.readingTextClear'],
          callout: {
            kind: 'warn',
            text: 'The text applies to submissions from the moment it is saved. Change it BEFORE setting a new assignment, or new work is scored against the old passage.',
          },
          example: {
            title: 'Example — Tiny Rabbit reading text',
            text: 'Playground. Written by Elizabeth Jane Pustilnik. What can you do at the playground? The gate. The swing. The slide. The sandbox. The ladder. The bridge.',
          },
        },
      ],
      callout: { kind: 'warn', text: 'Missing authoring buttons means a missing permission: ask an admin for "criteria_author" or "rubric_template" in Users.' },
    },

    content: {
      heading: 'Adapting a course rubric — what goes in each field',
      intro: ['EDIT the version in use: it already carries the full text from the centre\'s files. Each save creates a new version and keeps the old ones.'],
      steps: [
        { title: 'Open the version in use', body: ['Criteria → "Courses & versions" tab → the course row shows the version in use → View to read it, Edit to change it.'], uiKeys: ['nav.criteria', 'criteria.tab.courses', 'criteria.view', 'templates.edit'] },
        {
          title: 'Check each band description',
          body: ['One field per score. Each new line becomes a bullet. Be specific.'],
          uiKeys: ['authoring.bands'],
          example: {
            title: 'Example — Pronunciation, KID (Rubric Speaking A0–A2)',
            text: 'Band 0: Không phát âm được, khó hiểu.\nBand 3: Phát âm đúng đa số từ quen thuộc, đôi lúc gây nhầm.\nBand 5: Phát âm rõ ràng, dễ hiểu, gần chuẩn người bản ngữ.',
          },
        },
        {
          title: 'Sub-factors — what they are, how to fill them, when to use them (optional)',
          body: [
            'A sub-factor splits ONE criterion into smaller aspects with SHORT keywords per band. Its only purpose is to help the AI tell adjacent bands apart (e.g. 6 vs 7).',
            '• It adds NO score — the criterion still has one score.',
            '• Students never see it.',
            '• Empty sub-factors are dropped on Save.',
            'Under the band descriptions of a criterion, click "Add sub-factor": one name field plus one small field per band. Type a few keywords; leave unneeded bands empty. Each row of the Analytic Scoring Band comparison table is one sub-factor.',
          ],
          uiKeys: ['authoring.subFactors', 'authoring.addSubFactor', 'authoring.subFactorLabel'],
          figures: [
            {
              src: '/guide-img/ielts-yeu-to-con.png',
              alt: 'Band 4 to 8 comparison table for Fluency and coherence',
              caption: 'Analytic Scoring Band — band 4–8 comparison for Fluency and coherence. Each row is one sub-factor.',
            },
          ],
          example: {
            title: 'Example — Fluency and coherence',
            text: 'Name: Length, speed\n   Band 4: Speak slowly · Band 6: Willing to speak at length · Band 8: Speak fluently\nName: Hesitation\n   Band 4: Frequent · Band 6: Occasionally · Band 8: Content-related, rarely language',
          },
          callout: {
            kind: 'tip',
            text: 'Kids (Cambridge) courses do not need them. For IELTS, add them only for a criterion where the AI repeatedly lands one band off the teacher, then re-test with Test Upload.',
          },
        },
        {
          title: 'Load sample comments',
          body: ['Paste comments teachers already write, pick the criterion and intent (praise / suggestion). The AI copies their tone.'],
          uiKeys: ['authoring.commentBank', 'authoring.addComment'],
          figures: [{ src: IMG.ylComments, alt: 'CMT LỚP KIDS-TEEN sample comments', caption: 'Source: "CMT LỚP KIDS-TEEN" in Rubric Speaking A0–C.' }],
        },
        { title: 'Preview, then save', body: ['Read the prompt preview, then Save. New submissions use the new version.'], uiKeys: ['authoring.preview', 'criteria.save'] },
        { title: 'Test before real use', body: ['Test Upload (admins only — ask one to do it with you) grades a clip without sending anything; check the result on Submissions.'], uiKeys: ['nav.testUpload', 'nav.submissions'] },
      ],
      callout: { kind: 'tip', text: 'Editing a rubric never changes grades already given.' },
    },

    structure: {
      heading: 'Building a brand-new rubric',
      intro: ['Only for a programme unlike Cambridge or IELTS. Needs "rubric_template".'],
      steps: [
        { title: 'Duplicate a structure', body: ['Criteria → "Rubrics & prompt" tab lists the structures in use → Rubric structure → Duplicate the closest one; give it a short key.'], uiKeys: ['templates.open', 'templates.duplicate'] },
        { title: 'Scale and total', body: ['From the file\'s scoring rules.'], uiKeys: ['templates.scale', 'templates.aggregationMethod'], example: { title: 'Example — KID', text: 'Min 0 · Max 5 · Step 1 · Sum → max total 25' } },
        { title: 'Criteria', body: ['One per row of the rubric table; "pronunciation" is required.'], uiKeys: ['templates.addDimension'], example: { title: 'Example — KID', text: 'pronunciation — Pronunciation (Âm chính)\nintonation — Intonation (Ngữ điệu)\nending_sounds — Ending sounds (Âm đuôi)\nword_stress — Word Stress (Trọng âm từ/cụm)\nfluency — Fluency (Trôi chảy)' } },
        { title: 'Levels (if the file maps totals)', body: ['Ranges must be contiguous from 0 to the max total.'], uiKeys: ['templates.levels'], example: { title: 'Example — KID', text: '0–10 A0 · 11–15 A1- · 16–20 A1 · 21–25 A2' } },
        {
          title: 'Outputs and student message template',
          body: ['Tick Comment and Fix. Keep this reply template exactly.'],
          uiKeys: ['templates.outputFields', 'templates.replyTemplate'],
          example: { title: 'Reply template', text: '{{feedback}}\n\n{{criteria}}\n\nEm chú ý phát âm các từ sau:\n{{pronunciation_errors}}' },
          callout: { kind: 'warn', text: 'Do not enable "show total" or "show level": students do not receive scores.' },
        },
      ],
      callout: { kind: 'warn', text: '"Reset to original" on a built-in structure also removes the reply template — ask an admin to re-enter it.' },
    },

    after: {
      heading: 'Reviewing and sending feedback',
      steps: [
        { title: 'Open the submission', body: ['Submissions → filter "awaiting_review" → View.'], uiKeys: ['nav.submissions', 'submissions.view'] },
        {
          title: 'Listen and check the measurements',
          body: [
            'With Azure on, "Azure measurements" shows 0–100 scores measured from the voice (accuracy, fluency, intonation, ending sounds, word stress) and the recognised speech. Those criteria are scored by Azure; comments and fixes are written by Gemini. IELTS lexical, grammar and coherence are still scored by Gemini.',
            'A yellow "Free speech (no reading text)" badge on a kids class means no reading text was entered — pronunciation scores are unreliable; listen carefully and add the text (Build criteria tab → "Which rubric is my class using?").',
          ],
          uiKeys: ['submissions.azureTitle', 'submissions.azureModeUnscripted'],
        },
        {
          title: 'Edit everything the student will receive',
          body: [
            'Opening comment, each score, comment, fix, and the suggestion for each mispronounced word. An "AI: …" badge shows the original score; the AI version is always kept. Students never receive scores.',
            'If you replay a word (▶) and the student said it correctly, press "Wrong flag": ONLY that word leaves the student message; the AI version is kept. If the machine missed a word, pause the audio there and press "+ Add a word the AI missed".',
            'On Send, which words you kept, flagged as wrong or added is recorded to evaluate the machine grader. Flag and add words exactly as you hear them — do not keep a word just because the machine flagged it.',
          ],
          uiKeys: ['submissions.overallFeedback', 'submissions.dimensionScore', 'submissions.comment', 'submissions.removeWord', 'submissions.addWord'],
        },
        {
          title: 'Send to student',
          body: ['Send SAVES your edits and sends exactly that version — no separate Save needed. Afterwards the fields lock; one send per submission. Long messages are split into 2–3 Zalo messages.'],
          uiKeys: ['students.save', 'submissions.send'],
          callout: { kind: 'warn', text: 'Log in again if the session is old (8 hours): sending then fails and nothing is sent.' },
        },
      ],
      example: {
        title: 'What the student receives (shortened, real PILOT-TEST submission)',
        text: 'Opening comment…\n\n🔹 Fluency and coherence\nNhận xét: …\n→ Hướng sửa: …\n\nEm chú ý phát âm các từ sau:\n• 0:43 — "genres" em đọc thành "jurns" → /ˈʒɑːn.rəz/',
      },
      callout: { kind: 'warn', text: 'Send within 48 hours of the student\'s message; after that Zalo blocks free replies and the student receives nothing.' },
    },

    wordLabels: {
      heading: 'Reading the labels on mispronounced words',
      intro: [
        'Under the pronunciation criterion is the list of words the student got wrong. For each: press ▶ to replay (it rewinds 2 seconds so you hear the lead-in), then keep it, edit the suggestion, or press "Wrong flag".',
        'The machine works in two passes: Azure measures each sound and flags words; then a 1–2 second clip around each word is cut for Gemini to re-hear and write the fix.',
      ],
      terms: [
        { term: 'No label', desc: 'Azure flagged it and Gemini\'s re-hearing agreed (or could not re-hear it). Usually a real error — replay if unsure.' },
        { term: 'Yellow "Teacher should listen"', desc: 'The machines disagree: Azure flagged it, Gemini heard it as acceptable. You decide — replay; said correctly → "Wrong flag"; said wrongly → keep. Listen to these first.' },
        { term: '"Found by Gemini (Azure missed it)"', desc: 'Azure scored the word as correct, but Gemini heard an error and confirmed it on the clip. Replay before keeping.' },
        { term: '"Added by teacher"', desc: 'A word you added with "+ Add a word the AI missed". Type the word and the fix; empty words are dropped on save.' },
        { term: 'Text in brackets and "Heard as"', desc: 'The bracketed text is the specific error Gemini heard (e.g. "/θ/ said as /t/") — teachers only. "Heard as" is how the student actually said it, in phonetics. The student receives the time, the word, what they said and the fix.' },
      ],
      example: { title: 'Example — one line the student receives on Zalo', text: '• 0:43 — "genres" em đọc thành "jurns" → Em đọc âm đầu /ʒ/ nhẹ, không bật như /dʒ/ nhé.' },
      callout: { kind: 'warn', text: '"Wrong flag" only removes the word from the student message — it does NOT change the pronunciation score. If many words go, adjust that criterion\'s Score too.' },
    },

    gradingTrouble: {
      heading: 'Problems while grading',
      terms: [
        { term: 'Send button greyed out, "Sent"', desc: 'Already sent. If the student got nothing, tell an admin the student name and send time — the usual cause is sending more than 48 hours after the student\'s message.' },
        { term: 'Send shows an error', desc: 'Usually an expired session (8 hours); nothing was sent. Log in again in a new tab, reopen the submission, check your edits are there, Send.' },
        { term: 'Student says they sent work but it is not in Submissions', desc: 'Their Zalo may not be activated. Go to Onboarding, enter the student\'s phone, click "Activate", and ask them to send again.' },
        { term: 'The machine flags a lot of words in one submission', desc: 'Common with free speech or kids classes without a reading text. Replay and "Wrong flag" each; for kids classes, add the reading text so later submissions are more accurate.' },
      ],
    },

    criteriaTrouble: {
      heading: 'Problems with criteria',
      terms: [
        { term: 'Yellow "Course has no criteria" badge', desc: 'That class will not be graded until its course has a rubric (see "Adapting a course rubric").' },
        { term: 'AI scores far from the teacher', desc: 'Make the confused bands more specific, add sub-factors, ask an admin to re-test with Test Upload.' },
        { term: 'Authoring buttons missing', desc: 'Missing permission — see the end of "Which rubric is my class using?".' },
      ],
    },
  },
};
