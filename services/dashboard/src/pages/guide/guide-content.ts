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
    queue: GuideSection;
    focus: GuideSection;
    after: GuideSection;
    wordLabels: GuideSection;
    wordActions: GuideSection;
    gradingTrouble: GuideSection;
  };
}

export type GuideSectionId = keyof GuideContent['sections'];

/** Tab nào chứa mục nào, theo thứ tự hiển thị — dùng chung cho mục lục lẫn thân trang. */
export const GUIDE_TABS: Record<GuideTabId, readonly GuideSectionId[]> = {
  features: ['overview', 'pages'],
  criteria: ['concepts', 'who', 'content', 'structure', 'criteriaTrouble'],
  grading: ['queue', 'focus', 'after', 'wordLabels', 'wordActions', 'gradingTrouble'],
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
        'Học viên gửi bài nói qua Zalo. Hệ thống chấm nghe và chấm theo bộ tiêu chí của khóa học. Giáo viên đọc lại, sửa nếu cần, rồi bấm gửi. Học viên nhận nhận xét qua Zalo.',
      ],
      terms: [
        { term: 'Bước 1 — Học viên gửi bài', desc: 'Học viên gửi file ghi âm vào Zalo OA của trung tâm. Hệ thống tự nhận, không ai phải bấm gì.' },
        { term: 'Bước 2 — Hệ thống chấm cho điểm', desc: 'Hệ thống chấm cho điểm theo bộ tiêu chí của khóa học mà học viên đang học. Điểm sát hay không phụ thuộc vào việc bộ tiêu chí viết rõ đến đâu — đó là phần việc của đội học thuật (tab Tạo tiêu chí).' },
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
          desc: 'Ba tab: "Khóa & phiên bản" — mỗi khóa đang chấm bằng phiên bản tiêu chí nào; "Cấu hình theo lớp" — lớp nào dùng bộ nào, và bài đọc của lớp thiếu nhi; "Tiêu chí & Chỉ dẫn chấm" — các cấu trúc chấm điểm và đoạn chỉ dẫn hệ thống chấm dùng. Chi tiết ở tab Tạo tiêu chí.',
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
        { term: 'Mô tả mức điểm', desc: 'Chữ trong từng ô của bảng. Ví dụ Pronunciation 3 điểm: "Phát âm đúng đa số từ quen thuộc, đôi lúc gây nhầm." Hệ thống chấm dựa vào những câu này để quyết định cho mấy điểm.' },
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
            'Vì sao cần: có bài đọc, hệ thống chấm đối chiếu từng từ học viên nói với văn bản nên chấm phát âm chính xác, và biết học viên có đọc đủ bài không. Không có, hệ thống chấm phải tự đoán trẻ nói gì — với giọng trẻ em nó hay đoán sai (đã đo: nghe "the ladder" thành "tornado"), bài bị gắn nhãn vàng để giáo viên nghe kỹ.',
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
            'Mỗi lần xuống dòng trong ô là một gạch đầu dòng. Viết càng cụ thể, hệ thống chấm càng chấm sát: "Phát âm khá rõ, lỗi nhỏ không ảnh hưởng hiểu" tốt hơn nhiều so với "Tạm được".',
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
            'Yếu tố con chia MỘT tiêu chí thành vài khía cạnh nhỏ, và ghi TỪ KHÓA NGẮN cho từng mức điểm. Mục đích duy nhất: giúp hệ thống chấm phân biệt hai mức điểm sát nhau, ví dụ band 6 với band 7.',
            '• KHÔNG tạo thêm điểm: tiêu chí vẫn chỉ có một điểm. Yếu tố con chỉ là ghi chú tham khảo cho hệ thống chấm khi chấm tiêu chí đó.',
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
            text: 'Khi nào dùng: lớp thiếu nhi (Cambridge) CHƯA cần — mô tả 0–5 điểm đã đủ rõ. Với IELTS, chỉ thêm khi thấy hệ thống chấm lệch lặp lại giữa hai band liền nhau (giáo viên cho 6, hệ thống chấm liên tục cho 7), và chỉ thêm cho ĐÚNG tiêu chí bị lệch — rồi chấm thử lại bằng Test Upload. Đừng điền cho mọi tiêu chí ngay từ đầu: nhiều chữ hơn không làm hệ thống chấm sát hơn.',
          },
        },
        {
          title: 'Nạp câu nhận xét mẫu để hệ thống chấm viết giống giáo viên',
          body: [
            'Ở Kho nhận xét, bấm Thêm nhận xét, dán một câu giáo viên vẫn hay viết, chọn nó thuộc tiêu chí nào và ý định là khen hay góp ý. Chỗ tên học viên hoặc từ cụ thể cứ để "…".',
            'Hệ thống chấm bắt chước giọng văn của những câu này. Nên có ít nhất một câu khen và một câu góp ý cho mỗi tiêu chí hay gặp.',
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
            'Khung Xem trước chỉ dẫn cho hệ thống chấm hiện đúng đoạn chỉ dẫn sẽ được dùng. Đọc lướt một lượt: bạn thấy khó hiểu thì hệ thống chấm cũng vậy.',
            'Bấm Lưu. Hệ thống báo "Đã lưu phiên bản …". Từ lúc này, bài nộp mới của khóa sẽ chấm theo phiên bản vừa lưu (trừ lớp đang Ghim riêng phiên bản cũ).',
          ],
          uiKeys: ['authoring.preview', 'criteria.save'],
        },
        {
          title: 'Chấm thử trước khi dùng thật',
          body: [
            'Mục Test Upload chỉ quản trị viên thấy — nhờ quản trị viên làm cùng: chọn một học viên thử (ví dụ lớp PILOT-TEST) và tải lên một file ghi âm. Bài được chấm như thật nhưng KHÔNG gửi cho ai — mở màn Bài nộp để xem hệ thống chấm cho điểm và nhận xét có sát với cách giáo viên chấm không.',
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
            'Vào Tiêu chí, tab "Tiêu chí & Chỉ dẫn chấm": bảng "Cấu trúc chấm điểm hiện có" cho thấy các khung đang có và bao nhiêu khóa đang dùng mỗi khung. Bấm Cấu trúc chấm điểm, tìm cấu trúc gần giống nhất rồi bấm Nhân bản — nhanh và ít sai hơn tạo mới. Đặt Khóa mới là mã ngắn không dấu, không đổi được về sau (ví dụ "kid_speaking_2027").',
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
            'Mỗi hàng của bảng rubric là một tiêu chí. "Khóa tiêu chí" là tên kỹ thuật (chữ thường, không dấu, nối bằng gạch dưới); "Nhãn hiển thị" là tên giáo viên đọc.',
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

    queue: {
      heading: 'Màn Bài nộp — đọc danh sách và trạng thái',
      intro: [
        'Mỗi dòng là MỘT TIN học viên gửi vào Zalo OA của trung tâm — không phải dòng nào cũng là bài nói. Việc của giáo viên nằm ở các dòng "awaiting_review"; phần lớn dòng còn lại chỉ để tra cứu.',
        'Bấm "Xem" trên bất kỳ dòng nào để mở chi tiết. Bài không chấm được thì cuối trang chi tiết có mục "Ghi chú (flags)" nói rõ lý do.',
      ],
      terms: [
        {
          term: 'Cột Học viên hiện "—"',
          desc: 'Hệ thống chưa biết tin này của học viên nào: Zalo gửi tin chưa được kích hoạt (xem mục Onboarding), hoặc một Zalo dùng chung cho nhiều học viên mà phụ huynh chưa chọn bài này của bạn nào. Tin loại follow/text luôn có thể hiện "—" — bình thường.',
        },
        {
          term: 'Cột Loại',
          desc: 'audio / video: ghi âm hoặc quay trực tiếp trong Zalo — được chấm. file: tệp đính kèm (học viên thu bằng app khác rồi gửi) — được chấm nếu tệp đúng là âm thanh/video. text: tin chữ. image: ảnh. follow: học viên vừa bấm "Quan tâm" Zalo OA — không phải bài nộp. Hệ thống KHÔNG chấm và KHÔNG trả lời text, image, follow.',
        },
        {
          term: 'received (xám) — Đã nhận, chưa chấm',
          desc: 'Bình thường với text, image, follow: dừng ở đây, không cần làm gì. Cần để ý khi Loại là audio/video/file mà Học viên là "—": học viên chưa được kích hoạt nên bài chưa được chấm. Kích hoạt ở mục Onboarding rồi nhờ học viên gửi lại — bài cũ KHÔNG tự chấm lại sau khi kích hoạt.',
        },
        {
          term: 'processing — Đang chấm',
          desc: 'Hệ thống đang tải file, đo phát âm và viết nhận xét — thường xong trong vài phút, clip dài lâu hơn. Nếu một bài đứng ở trạng thái này quá lâu (ví dụ sau 15 phút vẫn chưa đổi), hệ thống đã thử lại mà không chấm được: báo quản trị viên kèm tên học viên và giờ nhận.',
        },
        {
          term: 'awaiting_review (cam) — Chờ giáo viên duyệt',
          desc: 'Hệ thống chấm đã chấm xong. ĐÂY LÀ VIỆC CỦA BẠN. Học viên CHƯA nhận được gì cho tới khi có người bấm "Gửi cho học viên". Hạn là 48 giờ kể từ lúc học viên nhắn.',
        },
        {
          term: 'sent (xanh) — Đã gửi',
          desc: 'Tin nhận xét đã đi. Hoặc do giáo viên bấm Gửi, hoặc lớp được cài tự gửi không qua duyệt. Bài đã gửi thì mọi ô khóa lại, không sửa hay gửi lại được.',
        },
        {
          term: 'failed (đỏ) — Không chấm được',
          desc: 'Bấm Xem, đọc "Ghi chú (flags)" ở cuối trang. Lý do hay gặp: học viên chưa được gán khóa học (sửa ở màn Học viên); khóa chưa có bộ tiêu chí (tab Tạo tiêu chí); clip dài quá giới hạn — mặc định 7 phút, học viên đã tự nhận tin nhờ gửi clip ngắn hơn; tệp đính kèm không phải âm thanh. Sửa xong nguyên nhân thì nhờ học viên gửi lại — bài lỗi không tự chấm lại.',
        },
      ],
      steps: [
        {
          title: 'Thứ tự làm mỗi lần mở màn Bài nộp',
          body: [
            '1. Lọc Trạng thái = "awaiting_review". Làm bài CŨ NHẤT trước (danh sách xếp mới nhất ở trên, nên làm từ dưới lên) — hạn 48 giờ tính từ lúc học viên nhắn, không phải lúc bạn mở bài.',
            '2. Lọc "failed": xem ghi chú, sửa nguyên nhân nếu thuộc phần việc của bạn, hoặc báo quản trị viên.',
            '3. Lọc "received": nếu có dòng audio/video/file mà Học viên là "—", báo tư vấn/quản trị viên kích hoạt tài khoản rồi nhờ học viên gửi lại.',
          ],
          uiKeys: ['nav.submissions', 'submissions.filterStatus', 'submissions.filterClass', 'submissions.view'],
        },
      ],
      example: {
        title: 'Ví dụ đọc một đoạn danh sách',
        text:
          '— · follow · received → học viên mới bấm Quan tâm OA. Không cần làm gì.\n' +
          '— · file · received → một Zalo chưa kích hoạt gửi tệp. Cần kích hoạt rồi nhờ gửi lại.\n' +
          'Bùi Quang Vũ · file · failed (4:29 PM), rồi Bùi Quang Vũ · file · sent (4:31 PM) → lần đầu không chấm được, học viên gửi lại và bài mới đã được gửi nhận xét.\n' +
          'Bùi Văn Sơn (PILOT-TEST) · file · awaiting_review → việc của giáo viên: bấm Xem để duyệt.',
      },
    },

    focus: {
      heading: 'Khi duyệt một bài, tập trung vào đâu',
      intro: [
        'Học viên nhận ĐÚNG những gì nằm trong các ô chữ trên trang chi tiết — không kèm điểm số. Vì vậy thời gian nên dồn vào những gì học viên đọc và làm theo, theo thứ tự dưới đây.',
      ],
      steps: [
        {
          title: 'Danh sách từ phát âm sai — ưu tiên số 1',
          body: [
            'Đây là phần học viên dùng trực tiếp để luyện, và là phần hệ thống chấm hay sai nhất. Nghe trước các từ có nhãn vàng "Cần giáo viên nghe lại", rồi các từ "Phát hiện khi nghe lại", sau cùng là từ không nhãn.',
            'Với mỗi từ, trả lời một câu: học viên đọc từ này sai thật không? Sai → giữ. Đúng → "Gắn sai". Nghe thấy lỗi mà hệ thống chấm không có → "+ Thêm từ hệ thống chấm bỏ sót". Chi tiết từng nút ở mục "Gắn sai và Thêm từ — bấm xong chuyện gì xảy ra".',
          ],
          uiKeys: ['submissions.wordNeedsReview', 'submissions.wordFromGemini', 'submissions.removeWord', 'submissions.addWord'],
        },
        {
          title: 'Hướng sửa từng từ — đúng và làm theo được',
          body: [
            'Kiểm tra phiên âm trong hướng sửa có đúng từ điển không, và lời khuyên có chỉ ra CỤ THỂ phải làm gì với miệng, lưỡi, âm nào.',
            'Tốt: "Khép môi phát âm rõ âm cuối /v/ trong /lʌv/, tránh đọc thành âm /s/." Chưa tốt: "Chú ý phát âm từ này hơn." — học viên không biết phải sửa gì.',
            'Hướng sửa phải khớp với lỗi: dòng "express — nghe thành /t/ thay vì /s/" thì hướng sửa phải nói về âm /s/ cuối, không phải về trọng âm.',
          ],
        },
        {
          title: 'Nhận xét chung ở đầu tin',
          body: [
            'Đây là đoạn học viên (và phụ huynh) đọc đầu tiên. Kiểm tra: xưng hô thống nhất với cả tin; không nhắc điểm số hay "band"; khen/góp ý đúng với bài này chứ không chung chung.',
            'Mở "Nhận xét của hệ thống chấm (gốc)" ngay dưới ô nếu muốn so với bản ban đầu.',
          ],
          uiKeys: ['submissions.overallFeedback', 'submissions.llmFeedback'],
        },
        {
          title: 'Nhận xét và Hướng sửa từng tiêu chí',
          body: [
            'Hệ thống chấm đôi khi trích một câu hay một từ KHÔNG có trong bài. Mọi ví dụ được trích ("em nói it require…") phải nghe thấy được trong audio — không nghe thấy thì xóa hoặc thay bằng ví dụ thật.',
            'Sau khi "Gắn sai" một từ, đọc lại nhận xét phát âm: nếu câu nhận xét vẫn nhắc tới từ đó, sửa luôn câu đó — "Gắn sai" chỉ bỏ dòng trong danh sách từ, không sửa chữ trong nhận xét.',
          ],
          uiKeys: ['submissions.comment', 'submissions.scoreFix'],
        },
        {
          title: 'Điểm — sửa khi lệch rõ, không cần tinh chỉnh',
          body: [
            'Học viên không thấy điểm; điểm dùng cho báo cáo và để đo hệ thống chấm lệch giáo viên bao nhiêu. Sửa khi bạn chắc hệ thống chấm lệch rõ (ví dụ hệ thống chấm cho 4, bạn chấm 2). Không cần mất thời gian cân nhắc chênh lệch nhỏ.',
            'Tổng điểm và "Số liệu đo của hệ thống chấm" (0–100) chỉ để tham khảo, không sửa được và không gửi cho học viên.',
          ],
          uiKeys: ['submissions.dimensionScore', 'submissions.azureTitle'],
        },
      ],
      callout: {
        kind: 'warn',
        text: 'Chỉnh sửa CHƯA được lưu cho tới khi bạn bấm Lưu hoặc Gửi. Rời trang, tải lại trang (F5) hay đóng tab là mất hết phần đang sửa. Duyệt dở mà phải đi việc khác thì bấm Lưu trước.',
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
            'Nghe file ghi âm. Khi có lượt đo phát âm, khung "Số liệu đo của hệ thống chấm" hiện điểm 0–100 đo từ giọng nói: độ chính xác, trôi chảy, ngữ điệu, âm đuôi, trọng âm — và lời nói hệ thống chấm nhận dạng được.',
            'Điểm các tiêu chí đo được bằng giọng nói (phát âm, ngữ điệu, âm đuôi, trọng âm, trôi chảy) là do lượt đo phát âm đo, lần nào chấm lại cũng ra đúng số đó. Nhận xét và hướng sửa do hệ thống chấm viết dựa trên số đo. Với IELTS, hệ thống chấm cho điểm thêm Từ vựng, Ngữ pháp và phần Mạch lạc.',
            'Nhãn vàng "Nói tự do (không có bài đọc)" ở lớp thiếu nhi nghĩa là lớp chưa nhập bài đọc: điểm phát âm kém tin cậy, nghe kỹ trước khi gửi và nhập bài đọc cho lớp (tab Tạo tiêu chí → "Lớp của tôi đang chấm bằng bộ tiêu chí nào?").',
          ],
          uiKeys: ['submissions.azureTitle', 'submissions.azureModeScripted', 'submissions.azureModeUnscripted'],
        },
        {
          title: 'Sửa trực tiếp mọi thứ học viên sẽ nhận',
          body: [
            'Sửa được tất cả: nhận xét chung ở đầu tin, điểm từng tiêu chí, nhận xét, hướng sửa, và gợi ý cho từng từ phát âm sai.',
            'Từ học viên đọc ĐÚNG mà hệ thống chấm đánh dấu nhầm → "Gắn sai". Từ học viên đọc sai mà hệ thống chấm bỏ sót → dừng audio đúng chỗ, bấm "+ Thêm từ hệ thống chấm bỏ sót". Bấm xong chuyện gì xảy ra: xem mục "Gắn sai và Thêm từ — bấm xong chuyện gì xảy ra".',
            'Điểm bạn sửa khác điểm gốc thì cạnh ô hiện nhãn "Bản gốc: …" để đối chiếu. Bản gốc của hệ thống chấm luôn được giữ lại — dùng để đo hệ thống chấm lệch giáo viên bao nhiêu.',
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
        'Hệ thống chấm làm hai lượt: lượt đo phát âm đo từng âm và đánh dấu từ sai; sau đó hệ thống cắt riêng đoạn 1–2 giây quanh mỗi từ cho lượt nghe lại nghe kỹ và viết hướng sửa.',
      ],
      terms: [
        {
          term: 'Từ không có nhãn',
          desc: 'Lượt đo phát âm đánh dấu sai và lượt nghe lại đoạn cắt cũng thấy sai (hoặc chưa nghe lại được). Thường là lỗi thật — vẫn nên nghe nếu bạn phân vân.',
        },
        {
          term: 'Nhãn vàng "Cần giáo viên nghe lại"',
          desc: 'Hai lượt không khớp nhau: lượt đo phát âm đánh dấu sai, nhưng lượt nghe lại đoạn cắt thấy chấp nhận được. Bạn là người quyết định — nghe ▶: học viên đọc đúng thì bấm "Gắn sai"; đọc sai thì giữ và sửa gợi ý nếu cần. Nghe những từ này trước.',
        },
        {
          term: 'Nhãn "Phát hiện khi nghe lại"',
          desc: 'Lượt đo phát âm chấm từ này là đúng, nhưng khi nghe cả bài hệ thống chấm thấy sai và đã nghe lại đoạn cắt để xác nhận. Nghe lại trước khi giữ.',
        },
        {
          term: 'Nhãn "Hệ thống chấm bỏ sót"',
          desc: 'Từ học viên đọc sai mà hệ thống chấm bỏ sót — do bạn tự thêm bằng "+ Thêm từ hệ thống chấm bỏ sót". Sửa được từ, mốc giờ và hướng sửa; bấm "Xóa" để bỏ dòng. Từ để trống sẽ tự bị bỏ khi lưu.',
        },
        {
          term: 'Chữ trong ngoặc và "Nghe thành"',
          desc: 'Chữ trong ngoặc sau từ là lỗi cụ thể lượt nghe lại nghe được, ví dụ "/θ/ đọc thành /t/" — chỉ giáo viên thấy. "Nghe thành" là cách học viên thực sự đọc, ghi bằng phiên âm. Học viên nhận: mốc giờ, từ, "em đọc thành …" và hướng sửa.',
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

    wordActions: {
      heading: 'Gắn sai và Thêm từ — bấm xong chuyện gì xảy ra',
      intro: [
        'Hai nút này chỉ thay đổi DANH SÁCH TỪ trong tin gửi học viên. Không nút nào tự đổi điểm, tự sửa nhận xét, hay gửi gì đi ngay. Mọi thứ chỉ được lưu khi bạn bấm Lưu hoặc Gửi.',
      ],
      steps: [
        {
          title: '"Gắn sai" — nghĩa là "học viên đọc từ này ĐÚNG, hệ thống chấm đánh dấu nhầm"',
          body: [
            'Ngay khi bấm: dòng của từ đó biến mất khỏi danh sách trên màn hình. Chưa có gì được lưu hay gửi.',
            'Tin học viên nhận: không còn dòng của từ đó trong phần "Em chú ý phát âm các từ sau". Các từ khác, nhận xét, hướng sửa và điểm giữ nguyên.',
            'Điểm phát âm: KHÔNG đổi. Gắn sai nhiều từ đến mức điểm không còn hợp lý thì tự sửa ô Điểm.',
            'Nhận xét phát âm: KHÔNG đổi. Câu nhận xét còn nhắc tới từ vừa gắn sai thì sửa tay câu đó.',
            'Bản chấm gốc của hệ thống chấm: vẫn giữ nguyên trong hệ thống, không mất.',
            'Khi bấm Gửi: hệ thống ghi lại "giáo viên gắn sai từ này" (một lần, ở lần gửi). Số liệu này dùng để đo hệ thống chấm đánh dấu đúng được bao nhiêu phần — càng nhiều từ bị gắn sai, càng cho thấy hệ thống chấm cần chỉnh.',
          ],
          uiKeys: ['submissions.removeWord'],
          callout: {
            kind: 'warn',
            text: 'Chỉ bấm "Gắn sai" khi học viên đọc ĐÚNG. Nếu học viên đọc sai thật nhưng bạn muốn tin ngắn bớt, đừng dùng nút này — hệ thống sẽ tính là hệ thống chấm đánh dấu nhầm và làm lệch số đo độ chính xác. Hãy giữ từ lại, hoặc báo người phụ trách nếu tin thường quá dài.',
          },
        },
        {
          title: 'Lỡ bấm "Gắn sai" nhầm từ',
          body: [
            'Không có nút hoàn tác.',
            '• CHƯA bấm Lưu: tải lại trang (F5). Trang về đúng bản đã lưu gần nhất — từ vừa gắn sai quay lại, nhưng MỌI chỉnh sửa khác chưa lưu cũng mất.',
            '• ĐÃ bấm Lưu: dừng audio đúng chỗ từ đó, bấm "+ Thêm từ hệ thống chấm bỏ sót", gõ lại từ và hướng sửa. Học viên vẫn nhận đủ dòng đó; hệ thống sẽ ghi nhận thành một lần gắn sai và một từ giáo viên thêm.',
            '• ĐÃ Gửi: không sửa được nữa.',
          ],
          callout: {
            kind: 'tip',
            text: 'Thói quen an toàn: nghe và quyết định hết danh sách từ trước, rồi mới sửa nhận xét và bấm Lưu.',
          },
        },
        {
          title: '"+ Thêm từ hệ thống chấm bỏ sót" — học viên đọc sai một từ mà hệ thống chấm không đánh dấu',
          body: [
            'Trước khi bấm: phát audio và DỪNG đúng chỗ học viên đọc sai. Mốc giờ của dòng mới lấy đúng vị trí audio đang dừng (chưa phát audio thì là 0:00). Mốc này sửa tay được — xem bước "Sửa mốc giờ" bên dưới.',
            'Ngay khi bấm: một dòng mới xuất hiện cuối danh sách, gồm nút ▶, ô mốc giờ, nút "Lấy mốc đang phát", ô "Từ", nhãn "Hệ thống chấm bỏ sót", ô hướng sửa và nút "Xóa".',
            'Điền: ô "Từ" = đúng từ học viên đọc sai (một từ hoặc cụm ngắn). Ô dài = hướng sửa, nên kèm phiên âm. Không có ô "nghe thành" — muốn nói học viên đọc thành gì thì viết luôn vào hướng sửa.',
            'Để trống ô "Từ": dòng tự bị bỏ khi Lưu/Gửi, học viên không thấy.',
            'Tin học viên nhận: thêm một dòng "• mốc giờ — "từ" → hướng sửa".',
            'Điểm và nhận xét: KHÔNG đổi. Thêm nhiều lỗi mà điểm hệ thống chấm cho quá cao thì tự sửa ô Điểm.',
            'Khi bấm Gửi: hệ thống ghi lại "giáo viên thêm từ này" — dùng để đo hệ thống chấm bỏ sót bao nhiêu lỗi giáo viên nghe thấy.',
            'Thêm nhầm? Bấm "Xóa" trên chính dòng đó. Dòng biến mất và không bị tính là hệ thống chấm đánh dấu nhầm. (Từ giáo viên thêm không có nút "Gắn sai" — nút đó chỉ dành cho từ hệ thống chấm đánh dấu.)',
          ],
          uiKeys: ['submissions.addWord', 'submissions.wordFromTeacher'],
          example: {
            title: 'Ví dụ — thêm từ "vegetable" học viên đọc sai ở phút 1:24',
            text:
              'Phát audio, dừng ở 1:24 → bấm "+ Thêm từ hệ thống chấm bỏ sót"\n' +
              'Ô Từ: vegetable\n' +
              'Ô hướng sửa: Em đọc 3 âm tiết /ˈvedʒ.tə.bəl/, không đọc thành 4 âm tiết "ve-ge-ta-ble" nhé.\n\n' +
              'Học viên nhận:\n' +
              '• 1:24 — "vegetable" → Em đọc 3 âm tiết /ˈvedʒ.tə.bəl/, không đọc thành 4 âm tiết "ve-ge-ta-ble" nhé.',
          },
        },
        {
          title: 'Sửa mốc giờ của từ bạn đã thêm',
          body: [
            'Gõ mốc vào ô mốc giờ theo dạng phút:giây, ví dụ 1:29 (gõ 89 cũng được, tính là 89 giây), rồi bấm Enter hoặc bấm ra ngoài ô. Hệ thống ghi nhận ngay; bấm ▶ để nghe lại chỗ đó (tua lùi 2 giây để nghe cả câu dẫn).',
            'Hoặc phát audio tới đúng chỗ rồi bấm "Lấy mốc đang phát" — ô tự điền vị trí audio.',
            'Gõ sai dạng (ví dụ "1:75") hoặc vượt độ dài bài: ô viền đỏ, hệ thống giữ mốc cũ. Xóa trống ô: dòng gửi học viên sẽ không có mốc giờ.',
            'Học viên thấy đúng mốc này: "• 1:29 — "từ" → hướng sửa". Mốc giờ của từ MÁY đánh dấu thì không sửa được.',
          ],
          uiKeys: ['submissions.timeFromAudio'],
        },
        {
          title: 'Chỉ sửa hướng sửa, không gắn sai',
          body: [
            'Hệ thống chấm đánh dấu đúng từ nhưng hướng sửa chưa hay: sửa thẳng trong ô hướng sửa. Từ đó vẫn được tính là "giáo viên giữ" — hệ thống chấm đánh dấu đúng.',
            'Chữ của từ và mốc giờ do hệ thống chấm đánh dấu thì KHÔNG sửa được. Hệ thống chấm ghi sai tên từ (ví dụ từ khác hẳn) thì "Gắn sai" dòng đó rồi "+ Thêm từ" với từ đúng.',
          ],
        },
        {
          title: 'Lưu và Gửi khác nhau thế nào',
          body: [
            'Lưu: giữ bản đang sửa để làm tiếp sau, bài vẫn ở "awaiting_review", học viên chưa nhận gì, chưa ghi nhận giữ/gắn sai/thêm.',
            'Gửi cho học viên: lưu bản đang sửa, gửi đúng bản đó qua Zalo, ghi nhận giữ/gắn sai/thêm cho từng từ, chuyển bài sang "sent" và khóa mọi ô.',
          ],
          uiKeys: ['students.save', 'submissions.send'],
        },
      ],
      example: {
        title: 'Ví dụ — danh sách trên màn hình và phần học viên nhận',
        text:
          'Trên màn hình (hệ thống chấm đánh dấu 3 từ):\n' +
          '  ▶ 3:17 express — nghe thành /t/ thay vì /s/\n' +
          '  ▶ 2:13 away  [Cần giáo viên nghe lại]\n' +
          '  ▶ 4:43 love — nghe thành /s/ thay vì /v/\n\n' +
          'Giáo viên nghe: "away" học viên đọc đúng → Gắn sai. Nghe thêm thấy "vegetable" ở 1:24 đọc sai → Thêm từ.\n\n' +
          'Học viên nhận:\n' +
          'Em chú ý phát âm các từ sau:\n' +
          '• 3:17 — "express" em đọc thành "/t/ thay vì /s/" → Chú ý bật rõ âm /s/ ở cuối từ /ɪkˈspres/.\n' +
          '• 4:43 — "love" em đọc thành "/s/ thay vì /v/" → Khép môi phát âm rõ âm cuối /v/ trong /lʌv/.\n' +
          '• 1:24 — "vegetable" → Em đọc 3 âm tiết /ˈvedʒ.tə.bəl/ nhé.\n\n' +
          'Hệ thống ghi nhận: express, love = giữ · away = gắn sai · vegetable = giáo viên thêm.',
      },
    },

    gradingTrouble: {
      heading: 'Khi gặp vấn đề lúc chấm bài',
      terms: [
        {
          term: 'Lỡ bấm "Gắn sai" nhầm',
          desc: 'Chưa Lưu: tải lại trang (F5) — mất cả các chỉnh sửa khác chưa lưu. Đã Lưu: thêm lại từ đó bằng "+ Thêm từ hệ thống chấm bỏ sót". Xem mục "Gắn sai và Thêm từ".',
        },
        {
          term: 'Sửa xong, quay lại thì mất hết',
          desc: 'Chỉnh sửa chỉ được giữ khi bấm Lưu hoặc Gửi. Rời trang hay tải lại trang trước đó là mất. Duyệt dở thì bấm Lưu.',
        },
        {
          term: 'Bài "failed" hoặc audio/file "received" mà cột Học viên là "—"',
          desc: 'Xem mục "Màn Bài nộp — đọc danh sách và trạng thái": mở bài, đọc "Ghi chú (flags)", sửa nguyên nhân, rồi nhờ học viên gửi lại.',
        },
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
          term: 'Hệ thống chấm đánh dấu sai rất nhiều từ trong một bài',
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
          term: 'Hệ thống chấm cho điểm lệch nhiều so với giáo viên',
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
      intro: ['A student sends a speaking clip on Zalo. The grading system grades it against the course rubric. A teacher reviews, edits if needed, and sends. The student receives the feedback on Zalo.'],
      terms: [
        { term: 'Step 1 — Student submits', desc: 'The student sends an audio file to the centre\'s Zalo OA. Nothing to click.' },
        { term: 'Step 2 — The grading system scores it', desc: 'Against the rubric of the student\'s course. How close it gets depends on how clearly the rubric is written (Build criteria tab).' },
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
        { term: 'Criteria', desc: 'Three tabs: "Courses & versions" (which rubric version each course uses), "Per-class config" (which rubric each class uses, plus kids\' reading texts) and "Rubrics & grading instructions" (rubric structures and the instructions the grading system uses). See the Build criteria tab.' },
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
            'Why: with the text, the grading system aligns every spoken word to it — accurate pronunciation scores and a completeness check. Without it the grading system guesses what the child said, often wrongly (measured: "the ladder" heard as "tornado"), and the submission gets a yellow flag.',
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
            'A sub-factor splits ONE criterion into smaller aspects with SHORT keywords per band. Its only purpose is to help the grading system tell adjacent bands apart (e.g. 6 vs 7).',
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
            text: 'Kids (Cambridge) courses do not need them. For IELTS, add them only for a criterion where the grading system repeatedly lands one band off the teacher, then re-test with Test Upload.',
          },
        },
        {
          title: 'Load sample comments',
          body: ['Paste comments teachers already write, pick the criterion and intent (praise / suggestion). The grading system copies their tone.'],
          uiKeys: ['authoring.commentBank', 'authoring.addComment'],
          figures: [{ src: IMG.ylComments, alt: 'CMT LỚP KIDS-TEEN sample comments', caption: 'Source: "CMT LỚP KIDS-TEEN" in Rubric Speaking A0–C.' }],
        },
        { title: 'Preview, then save', body: ['Read the instructions preview, then Save. New submissions use the new version.'], uiKeys: ['authoring.preview', 'criteria.save'] },
        { title: 'Test before real use', body: ['Test Upload (admins only — ask one to do it with you) grades a clip without sending anything; check the result on Submissions.'], uiKeys: ['nav.testUpload', 'nav.submissions'] },
      ],
      callout: { kind: 'tip', text: 'Editing a rubric never changes grades already given.' },
    },

    structure: {
      heading: 'Building a brand-new rubric',
      intro: ['Only for a programme unlike Cambridge or IELTS. Needs "rubric_template".'],
      steps: [
        { title: 'Duplicate a structure', body: ['Criteria → "Rubrics & grading instructions" tab lists the structures in use → Rubric structure → Duplicate the closest one; give it a short key.'], uiKeys: ['templates.open', 'templates.duplicate'] },
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

    queue: {
      heading: 'The Submissions screen — reading the list and statuses',
      intro: [
        'Each row is ONE MESSAGE a student sent to the centre\'s Zalo OA — not every row is a speaking clip. Your work is the "awaiting_review" rows; most others are for reference.',
        'Click "View" on any row for details. If a submission could not be graded, "Flags" at the bottom of the detail page says why.',
      ],
      terms: [
        { term: 'Student column shows "—"', desc: 'The system does not know which student sent it: the Zalo account is not activated yet (see Onboarding), or one Zalo account is shared by several students and the parent has not picked which one. follow/text rows often show "—" — that is normal.' },
        { term: 'Kind column', desc: 'audio / video: recorded in Zalo — graded. file: an attachment recorded in another app — graded if it really is audio/video. text, image: not graded. follow: the student just followed the OA — not a submission. The system neither grades nor replies to text, image or follow.' },
        { term: 'received (grey) — Received, not graded', desc: 'Normal for text, image, follow. Watch for audio/video/file rows with "—" as the student: the account is not activated, so nothing was graded. Activate it in Onboarding and ask the student to send again — old submissions are NOT re-graded after activation.' },
        { term: 'processing — Being graded', desc: 'Downloading, measuring pronunciation and writing feedback — usually a few minutes, longer for long clips. If a row stays here for a long time (e.g. still unchanged after 15 minutes), the system retried and gave up: tell an admin the student name and time received.' },
        { term: 'awaiting_review (orange) — Waiting for a teacher', desc: 'The grading system has finished. THIS IS YOUR WORK. The student has received nothing until someone clicks "Send to student". Deadline: 48 hours from the student\'s message.' },
        { term: 'sent (green) — Sent', desc: 'Sent by a teacher, or automatically for a class set to auto-send. Fields are locked; it cannot be edited or re-sent.' },
        { term: 'failed (red) — Could not be graded', desc: 'Click View and read "Flags". Usual causes: student has no course (fix on Students); course has no rubric (Build criteria tab); clip longer than the limit — 7 minutes by default, and the student was already asked to send a shorter one; attachment is not audio. After fixing the cause, ask the student to send again — failed work is not re-graded.' },
      ],
      steps: [
        {
          title: 'Order of work each time you open Submissions',
          body: [
            '1. Filter Status = "awaiting_review". Do the OLDEST first (the list shows newest at the top, so work from the bottom) — the 48 hours run from the student\'s message, not from when you open it.',
            '2. Filter "failed": read the notes, fix the cause if it is yours, or tell an admin.',
            '3. Filter "received": for audio/video/file rows with "—" as the student, ask an advisor/admin to activate the account, then ask the student to resend.',
          ],
          uiKeys: ['nav.submissions', 'submissions.filterStatus', 'submissions.filterClass', 'submissions.view'],
        },
      ],
      example: {
        title: 'Example — reading part of the list',
        text:
          '— · follow · received → a new follower. Nothing to do.\n' +
          '— · file · received → an unactivated Zalo account sent a file. Activate, then ask for a resend.\n' +
          'Bùi Quang Vũ · file · failed (4:29 PM), then Bùi Quang Vũ · file · sent (4:31 PM) → the first attempt failed; the student resent and the new one was sent.\n' +
          'Bùi Văn Sơn (PILOT-TEST) · file · awaiting_review → teacher work: click View.',
      },
    },

    focus: {
      heading: 'What to focus on when reviewing',
      intro: ['The student receives EXACTLY what is in the text fields of the detail page — never scores. Spend your time on what the student reads and acts on, in this order.'],
      steps: [
        {
          title: 'The mispronounced-word list — priority 1',
          body: [
            'This is what students practise from, and where the grading system is most often wrong. Listen first to yellow "Teacher should listen" words, then "Found on re-listen", then unlabelled words.',
            'For each word ask one question: did the student really say it wrong? Yes → keep. No → "Wrong flag". Heard an error the grading system missed → "+ Add a word the grading system missed". See "Wrong flag and Add word — what happens".',
          ],
          uiKeys: ['submissions.wordNeedsReview', 'submissions.wordFromGemini', 'submissions.removeWord', 'submissions.addWord'],
        },
        {
          title: 'Each word\'s fix — correct and actionable',
          body: [
            'Check the phonetics against a dictionary, and that the advice says SPECIFICALLY what to do with the mouth, tongue, which sound.',
            'Good: "Close the lips and clearly say the final /v/ in /lʌv/, not /s/." Weak: "Pay more attention to this word."',
            'The fix must match the error: "express — heard /t/ instead of /s/" needs advice about the final /s/, not about stress.',
          ],
        },
        {
          title: 'The opening comment',
          body: [
            'The first thing the student (and parent) reads. Check consistent forms of address, no scores or bands, and praise/advice specific to this piece of work.',
            'Open "Grading system feedback (original)" below the field to compare with the first draft.',
          ],
          uiKeys: ['submissions.overallFeedback', 'submissions.llmFeedback'],
        },
        {
          title: 'Comment and Fix for each criterion',
          body: [
            'The grading system sometimes quotes a phrase that is NOT in the recording. Every quoted example must be audible — if not, delete it or replace it with a real one.',
            'After a "Wrong flag", re-read the pronunciation comment: if it still mentions that word, edit the sentence — "Wrong flag" only removes the word from the list.',
          ],
          uiKeys: ['submissions.comment', 'submissions.scoreFix'],
        },
        {
          title: 'Scores — fix clear misses, do not fine-tune',
          body: [
            'Students never see scores; they feed reports and measure how far the grading system is from teachers. Change a score when it is clearly off (it gave 4, you 2). Small differences are not worth your time.',
            'The total and the "Grading system measurements" (0–100) are for reference only — not editable, not sent.',
          ],
          uiKeys: ['submissions.dimensionScore', 'submissions.azureTitle'],
        },
      ],
      callout: { kind: 'warn', text: 'Edits are NOT saved until you click Save or Send. Leaving the page, reloading (F5) or closing the tab loses them. Interrupted mid-review? Click Save first.' },
    },

    after: {
      heading: 'Reviewing and sending feedback',
      steps: [
        { title: 'Open the submission', body: ['Submissions → filter "awaiting_review" → View.'], uiKeys: ['nav.submissions', 'submissions.view'] },
        {
          title: 'Listen and check the measurements',
          body: [
            'With the measuring pass on, "Grading system measurements" shows 0–100 scores measured from the voice (accuracy, fluency, intonation, ending sounds, word stress) and the recognised speech. Those criteria are scored by the measuring pass; the grading system writes the comments and fixes from those measurements, and for IELTS it also scores lexical, grammar and coherence.',
            'A yellow "Free speech (no reading text)" badge on a kids class means no reading text was entered — pronunciation scores are unreliable; listen carefully and add the text (Build criteria tab → "Which rubric is my class using?").',
          ],
          uiKeys: ['submissions.azureTitle', 'submissions.azureModeUnscripted'],
        },
        {
          title: 'Edit everything the student will receive',
          body: [
            'Opening comment, each score, comment, fix, and the suggestion for each mispronounced word. An "Original: …" badge shows the original score; the original is always kept. Students never receive scores.',
            'Said correctly but flagged → "Wrong flag". Said wrongly but missed → pause the audio there and press "+ Add a word the grading system missed". What each button does: see "Wrong flag and Add word — what happens".',
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
        'The grading system works in two passes: the measuring pass measures each sound and flags words; then a 1–2 second clip around each word is cut for the re-listening pass to hear again and write the fix.',
      ],
      terms: [
        { term: 'No label', desc: 'The measuring pass flagged it and the re-listening pass agreed (or could not re-hear it). Usually a real error — replay if unsure.' },
        { term: 'Yellow "Teacher should listen"', desc: 'The two passes disagree: the measuring pass flagged it, the re-listening pass heard it as acceptable. You decide — replay; said correctly → "Wrong flag"; said wrongly → keep. Listen to these first.' },
        { term: '"Found on re-listen"', desc: 'The measuring pass scored the word as correct, but the grading system heard an error in the whole recording and confirmed it on the clip. Replay before keeping.' },
        { term: '"Missed by the grading system"', desc: 'A word the student got wrong that the grading system missed, added by you with "+ Add a word the grading system missed". Word, time and fix are editable; "Delete" removes the row. Empty words are dropped on save.' },
        { term: 'Text in brackets and "Heard as"', desc: 'The bracketed text is the specific error the re-listening pass heard (e.g. "/θ/ said as /t/") — teachers only. "Heard as" is how the student actually said it, in phonetics. The student receives the time, the word, what they said and the fix.' },
      ],
      example: { title: 'Example — one line the student receives on Zalo', text: '• 0:43 — "genres" em đọc thành "jurns" → Em đọc âm đầu /ʒ/ nhẹ, không bật như /dʒ/ nhé.' },
      callout: { kind: 'warn', text: '"Wrong flag" only removes the word from the student message — it does NOT change the pronunciation score. If many words go, adjust that criterion\'s Score too.' },
    },

    wordActions: {
      heading: 'Wrong flag and Add word — what happens',
      intro: ['Both buttons only change the WORD LIST in the student message. Neither changes a score, edits a comment or sends anything. Nothing is stored until you click Save or Send.'],
      steps: [
        {
          title: '"Wrong flag" — meaning "the student said this word CORRECTLY; the grading system was wrong"',
          body: [
            'Immediately: the word\'s row disappears from the list. Nothing is saved or sent yet.',
            'Student message: that word\'s line is gone from "Em chú ý phát âm các từ sau". Other words, comments, fixes and scores stay.',
            'Pronunciation score: NOT changed — adjust it yourself if many words go.',
            'Pronunciation comment: NOT changed — edit any sentence that still mentions the word.',
            'The grading system\'s original grading: kept in the system.',
            'On Send: "teacher flagged this word as wrong" is recorded (once). This measures how often the grading system flags correctly.',
          ],
          uiKeys: ['submissions.removeWord'],
          callout: { kind: 'warn', text: 'Use "Wrong flag" only when the student said the word CORRECTLY. Removing a real error just to shorten the message is counted as a grading-system mistake and skews the accuracy figures — keep it, or tell the academic lead if messages are routinely too long.' },
        },
        {
          title: 'Pressed "Wrong flag" by mistake',
          body: [
            'There is no undo.',
            '• NOT saved yet: reload the page (F5). It returns to the last saved version — the word comes back, but ALL other unsaved edits are lost too.',
            '• Already saved: pause the audio on that word, press "+ Add a word the grading system missed" and type it again. The student still gets the line; it is recorded as one wrong flag plus one teacher-added word.',
            '• Already sent: cannot be changed.',
          ],
          callout: { kind: 'tip', text: 'Safe habit: decide the whole word list first, then edit comments, then Save.' },
        },
        {
          title: '"+ Add a word the grading system missed" — the student got a word wrong and the grading system missed it',
          body: [
            'Before pressing: play the audio and PAUSE on the error. The new row takes its time from where the audio is paused (0:00 if never played). You can retype it — see "Editing the time" below.',
            'Immediately: a new row appears at the end with ▶, a time field, "Use playing time", a "Word" field, a "Missed by the grading system" badge, a fix field and "Delete".',
            'Fill in: "Word" = exactly the word said wrongly (one word or a short phrase). The long field = the fix, ideally with phonetics. There is no "heard as" field — put that in the fix if needed.',
            'Empty "Word": the row is dropped on Save/Send; the student never sees it.',
            'Student message: one more line "• time — "word" → fix".',
            'Score and comments: NOT changed.',
            'On Send: "teacher added this word" is recorded — this measures how many errors the grading system misses.',
            'Added by mistake? Press "Delete" on that row. It is not counted as a grading-system mistake. (Teacher-added words have no "Wrong flag" — that button is only for words the grading system flagged.)',
          ],
          uiKeys: ['submissions.addWord', 'submissions.wordFromTeacher'],
          example: {
            title: 'Example — adding "vegetable" at 1:24',
            text: 'Play, pause at 1:24 → "+ Add a word the grading system missed"\nWord: vegetable\nFix: Em đọc 3 âm tiết /ˈvedʒ.tə.bəl/, không đọc thành 4 âm tiết "ve-ge-ta-ble" nhé.\n\nThe student receives:\n• 1:24 — "vegetable" → Em đọc 3 âm tiết /ˈvedʒ.tə.bəl/, không đọc thành 4 âm tiết "ve-ge-ta-ble" nhé.',
          },
        },
        {
          title: 'Editing the time of a word you added',
          body: [
            'Type min:sec in the time field, e.g. 1:29 (89 also works, as seconds), then Enter or click away. It is recorded at once; press ▶ to replay there (it rewinds 2 seconds for the lead-in).',
            'Or play the audio to the right spot and press "Use playing time".',
            'A wrong format (e.g. "1:75") or a time past the end turns the field red and keeps the old time. An empty field means no time in the student line.',
            'The student sees this time: "• 1:29 — "word" → fix". Times of words the grading system flagged cannot be edited.',
          ],
          uiKeys: ['submissions.timeFromAudio'],
        },
        {
          title: 'Editing only the fix',
          body: [
            'Right word, weak advice: edit the fix field. The word still counts as "kept" — the grading system was right.',
            'The word text and time of a word the grading system flagged cannot be edited. If it named the wrong word, "Wrong flag" it and add the right one.',
          ],
        },
        {
          title: 'Save vs Send',
          body: [
            'Save: keeps your edits for later; still "awaiting_review"; the student receives nothing; kept/flagged/added not recorded yet.',
            'Send to student: saves, sends exactly that version on Zalo, records kept/flagged/added per word, sets "sent" and locks the fields.',
          ],
          uiKeys: ['students.save', 'submissions.send'],
        },
      ],
    },

    gradingTrouble: {
      heading: 'Problems while grading',
      terms: [
        { term: 'Pressed "Wrong flag" by mistake', desc: 'Not saved: reload (F5) — other unsaved edits are lost too. Saved: add the word back with "+ Add a word the grading system missed".' },
        { term: 'My edits disappeared', desc: 'Edits are kept only after Save or Send; leaving or reloading the page before that loses them.' },
        { term: '"failed", or audio/file "received" with "—" as the student', desc: 'See "The Submissions screen": open it, read "Flags", fix the cause, ask the student to resend.' },
        { term: 'Send button greyed out, "Sent"', desc: 'Already sent. If the student got nothing, tell an admin the student name and send time — the usual cause is sending more than 48 hours after the student\'s message.' },
        { term: 'Send shows an error', desc: 'Usually an expired session (8 hours); nothing was sent. Log in again in a new tab, reopen the submission, check your edits are there, Send.' },
        { term: 'Student says they sent work but it is not in Submissions', desc: 'Their Zalo may not be activated. Go to Onboarding, enter the student\'s phone, click "Activate", and ask them to send again.' },
        { term: 'The grading system flags a lot of words in one submission', desc: 'Common with free speech or kids classes without a reading text. Replay and "Wrong flag" each; for kids classes, add the reading text so later submissions are more accurate.' },
      ],
    },

    criteriaTrouble: {
      heading: 'Problems with criteria',
      terms: [
        { term: 'Yellow "Course has no criteria" badge', desc: 'That class will not be graded until its course has a rubric (see "Adapting a course rubric").' },
        { term: 'Grading system scores far from the teacher', desc: 'Make the confused bands more specific, add sub-factors, ask an admin to re-test with Test Upload.' },
        { term: 'Authoring buttons missing', desc: 'Missing permission — see the end of "Which rubric is my class using?".' },
      ],
    },
  },
};
