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
 */

export interface GuideCallout {
  kind: 'tip' | 'warn';
  text: string;
}

export interface GuideStep {
  title: string;
  body: string[];
  /** Khóa i18n của nhãn/nút thật, render thành "chip" để giáo viên đối chiếu với màn hình. */
  uiKeys?: string[];
  callout?: GuideCallout;
}

export interface GuideTerm {
  term: string;
  desc: string;
}

export interface GuideSection {
  heading: string;
  intro?: string[];
  terms?: GuideTerm[];
  steps?: GuideStep[];
  callout?: GuideCallout;
}

export interface GuideContent {
  title: string;
  lead: string;
  tocHeading: string;
  sections: {
    overview: GuideSection;
    concepts: GuideSection;
    who: GuideSection;
    structure: GuideSection;
    content: GuideSection;
    after: GuideSection;
    trouble: GuideSection;
  };
}

/** Thứ tự hiển thị các mục — dùng chung cho cả mục lục lẫn thân trang. */
export const GUIDE_SECTION_ORDER = [
  'overview',
  'concepts',
  'who',
  'structure',
  'content',
  'after',
  'trouble',
] as const;

export type GuideSectionId = (typeof GUIDE_SECTION_ORDER)[number];

export const guideVi: GuideContent = {
  title: 'Hướng dẫn soạn tiêu chí chấm điểm',
  lead: 'Trang này hướng dẫn từ đầu đến cuối: từ dựng bộ khung chấm điểm cho tới soạn nội dung chấm cho từng khóa học. Không cần biết kỹ thuật — chỉ cần làm theo thứ tự.',
  tocHeading: 'Nội dung',

  sections: {
    overview: {
      heading: '1. Hệ thống này làm gì',
      intro: [
        'Học viên gửi bài nói (thường là clip khoảng 5 phút) qua Zalo. Hệ thống nhận bài, cho AI chấm theo đúng tiêu chí của khóa học, rồi trả nhận xét về cho học viên.',
        'Bốn bước diễn ra như sau:',
      ],
      terms: [
        { term: 'Bước 1 — Học viên gửi bài', desc: 'Học viên gửi clip nói vào Zalo OA của trung tâm. Hệ thống tự nhận, không cần ai bấm gì.' },
        { term: 'Bước 2 — AI chấm', desc: 'AI nghe clip và chấm theo tiêu chí bạn đã soạn cho khóa học đó. Đây là lý do phần soạn tiêu chí quan trọng: AI chấm đúng hay sai phụ thuộc vào những gì bạn viết.' },
        { term: 'Bước 3 — Giáo viên duyệt', desc: 'Nếu lớp đang TẮT tự động gửi, bài sẽ nằm chờ ở màn Bài nộp để giáo viên đọc, sửa nhận xét rồi mới gửi.' },
        { term: 'Bước 4 — Gửi lại học viên', desc: 'Nhận xét được gửi về Zalo cho học viên. Hệ thống không bao giờ nhắn cho phụ huynh và không nhắc bài.' },
      ],
      callout: {
        kind: 'tip',
        text: 'Nhận xét của AI là để học viên luyện tập hằng ngày, không thay thế điểm chính thức của giáo viên.',
      },
    },

    concepts: {
      heading: '2. Hai thứ bạn cần soạn — và khác nhau thế nào',
      intro: [
        'Đây là phần hay nhầm nhất, nên đọc kỹ một lần là về sau làm rất nhanh. Việc soạn tiêu chí được tách làm hai lớp:',
      ],
      terms: [
        {
          term: 'Cấu trúc chấm điểm — cái khung',
          desc: 'Quy định bài được chấm theo mấy tiêu chí, thang điểm từ mấy đến mấy, cộng tổng hay lấy trung bình, và bao nhiêu điểm thì ứng với cấp độ nào. Hãy hình dung nó là TỜ PHIẾU CHẤM CÒN TRỐNG.',
        },
        {
          term: 'Nội dung chấm điểm — chữ điền vào khung',
          desc: 'Với mỗi tiêu chí, mỗi mức điểm nghĩa là gì; các yếu tố con cần để ý; kho câu nhận xét mẫu theo văn phong của trung tâm. Đây là PHẦN BẠN VIẾT VÀO PHIẾU.',
        },
      ],
      callout: {
        kind: 'tip',
        text: 'Vì sao tách đôi? Để mọi lớp trong cùng một khóa chấm trên cùng một thang, số liệu so sánh được với nhau — và để bạn sửa câu chữ mà không lỡ tay đổi mất thang điểm. Thường thì cấu trúc dựng một lần rồi dùng lâu dài, còn nội dung là việc bạn làm thường xuyên.',
      },
    },

    who: {
      heading: '3. Ai làm được gì',
      intro: [
        'Hai lớp trên tương ứng với hai quyền riêng. Quản trị viên (admin) luôn có cả hai.',
      ],
      terms: [
        { term: 'Quyền "rubric_template"', desc: 'Dựng, sửa, nhân bản, xóa CẤU TRÚC chấm điểm. Thường cấp cho trưởng bộ môn hoặc người thiết kế chương trình.' },
        { term: 'Quyền "criteria_author"', desc: 'Soạn NỘI DUNG chấm điểm cho khóa học, và tải lên file .docx. Thường cấp cho giáo viên phụ trách khóa.' },
      ],
      callout: {
        kind: 'warn',
        text: 'Không thấy nút mình cần? Gần như chắc chắn là chưa được cấp quyền, chứ không phải hỏng. Nhờ quản trị viên vào màn Người dùng tích quyền tương ứng cho tài khoản của bạn — quyền có hiệu lực ngay, không cần đăng xuất rồi đăng nhập lại.',
      },
    },

    structure: {
      heading: '4. Dựng cấu trúc chấm điểm',
      intro: [
        'Cần quyền "rubric_template". Nếu trung tâm đã dựng sẵn cấu trúc phù hợp thì bỏ qua mục này và sang thẳng mục 5.',
      ],
      steps: [
        {
          title: 'Mở danh sách cấu trúc',
          body: ['Vào Tiêu chí ở thanh bên trái, rồi bấm nút mở danh sách cấu trúc.'],
          uiKeys: ['nav.criteria', 'templates.open'],
        },
        {
          title: 'Chọn cách bắt đầu',
          body: [
            'Hệ thống có sẵn hai cấu trúc mặc định: Cambridge Young Learners (5 tiêu chí, thang 0–5, cộng tổng 25 điểm rồi quy ra cấp độ) và IELTS Speaking (4 tiêu chí, thang 0–9, lấy trung bình).',
            'Bạn có ba lựa chọn: dùng luôn một mẫu có sẵn; bấm Nhân bản để tạo biến thể riêng mà vẫn giữ nguyên bản gốc; hoặc bấm Tạo cấu trúc mới để dựng từ đầu.',
          ],
          uiKeys: ['templates.duplicate', 'templates.new'],
          callout: {
            kind: 'tip',
            text: 'Nếu chỉ cần chỉnh vài chỗ so với mẫu có sẵn, hãy Nhân bản thay vì dựng lại từ đầu — nhanh hơn và ít sai sót hơn.',
          },
        },
        {
          title: 'Điền thông tin chung và thang điểm',
          body: [
            'Đặt Khóa (key) — mã ngắn không dấu, không đổi được sau khi tạo — và Tên để mọi người nhận ra.',
            'Chọn thang điểm: nhỏ nhất, lớn nhất và bước nhảy. Ví dụ Cambridge là 0 đến 5 bước 1; IELTS là 0 đến 9 bước 1.',
            'Chọn cách tính tổng: Tổng (cộng điểm các tiêu chí lại) hay Trung bình (lấy trung bình cộng). Ô Tổng điểm tối đa ngay bên cạnh sẽ tự cập nhật để bạn kiểm chứng.',
          ],
          uiKeys: ['templates.scale', 'templates.aggregationMethod'],
        },
        {
          title: 'Khai báo các tiêu chí',
          body: [
            'Mỗi tiêu chí có một khóa máy (chữ thường không dấu, ví dụ "fluency") và một nhãn hiển thị cho người đọc (ví dụ "Fluency (Trôi chảy)").',
            'Bắt buộc phải có một tiêu chí mang khóa "pronunciation". Đây là quy định của hệ thống, không bỏ được.',
          ],
          uiKeys: ['templates.addDimension', 'templates.dimKey', 'templates.dimLabel'],
        },
        {
          title: 'Lập bảng cấp độ (nếu cần)',
          body: [
            'Bảng này quy đổi tổng điểm ra cấp độ, ví dụ 0–10 là Pre-starter, 11–15 là Starter, 16–20 là Mover, 21–25 là Flyer.',
            'Các khoảng phải liền nhau và phủ kín từ 0 đến tổng điểm tối đa. Nếu bị hở hoặc chồng lấn, hệ thống sẽ báo ngay bên dưới.',
            'Không cần quy đổi cấp độ thì cứ để trống bảng này.',
          ],
          uiKeys: ['templates.levels', 'templates.addLevel'],
        },
        {
          title: 'Chọn đầu ra và khóa trường',
          body: [
            'Đầu ra quy định AI phải trả về những gì cho mỗi tiêu chí: chỉ Nhận xét, hoặc cả Hướng sửa.',
            'Khóa trường quyết định giáo viên soạn nội dung được phép đổi những gì. Trường bị khóa sẽ hiện ổ khóa và chỉ đọc ở bước soạn nội dung — dùng để giữ thang điểm và cách tính thống nhất giữa các lớp.',
          ],
          uiKeys: ['templates.outputFields', 'templates.locked'],
        },
      ],
      callout: {
        kind: 'warn',
        text: 'Hai cấu trúc mặc định không xóa được — chỉ Ẩn đi. Bù lại chúng có nút Khôi phục bản gốc để lấy lại nguyên trạng nếu sửa hỏng. Với cấu trúc tự tạo thì xóa được, và việc xóa KHÔNG ảnh hưởng gì tới các nội dung đã soạn từ nó trước đó.',
      },
    },

    content: {
      heading: '5. Soạn nội dung chấm điểm',
      intro: [
        'Cần quyền "criteria_author". Đây là việc giáo viên làm thường xuyên nhất.',
      ],
      steps: [
        {
          title: 'Mở trình soạn',
          body: ['Vào Tiêu chí rồi bấm nút soạn nội dung. Muốn sửa lại một phiên bản đã có thì bấm Sửa ngay trên dòng phiên bản đó trong danh sách.'],
          uiKeys: ['authoring.open'],
        },
        {
          title: 'Chọn khóa học và cấu trúc',
          body: [
            'Chọn khóa học bạn đang soạn, rồi chọn cấu trúc chấm điểm sẽ dùng làm khung. Các ô bên dưới sẽ tự dựng theo cấu trúc đó.',
          ],
          uiKeys: ['authoring.courseStep', 'authoring.selectTemplate'],
        },
        {
          title: 'Viết mô tả cho từng mức điểm',
          body: [
            'Đây là phần quan trọng nhất. Với mỗi tiêu chí, bảng mức điểm hiện một dòng cho mỗi mức trong thang — thang 0–5 thì có 6 dòng, thang 0–9 thì có 10 dòng.',
            'Ở mỗi ô, viết mô tả học viên ở mức đó nói như thế nào. Mỗi dòng bạn xuống hàng sẽ thành một gạch đầu dòng khi gửi cho AI.',
            'Viết càng cụ thể, AI chấm càng sát. So sánh "Phát âm khá rõ, lỗi nhỏ không ảnh hưởng hiểu" với "Tạm được" — vế đầu cho AI một ranh giới rõ ràng, vế sau thì không.',
          ],
          uiKeys: ['authoring.bands'],
          callout: {
            kind: 'tip',
            text: 'Đổi thang điểm rộng ra thì bảng tự thêm dòng mới, phần bạn đã viết vẫn còn nguyên. Thu hẹp thang lại thì những mức nằm ngoài thang được gom xuống mục "Ngoài thang điểm hiện tại" chứ không bị xóa.',
          },
        },
        {
          title: 'Thêm yếu tố con (tùy chọn)',
          body: [
            'Với tiêu chí phức tạp, bạn có thể tách nhỏ để nói rõ ranh giới giữa các mức — ví dụ tiêu chí Trôi chảy tách thành độ dài câu, độ ngập ngừng, độ lặp, từ nối.',
            'Phần này không bắt buộc, nhưng là chỗ giúp AI phân biệt hai mức điểm sát nhau tốt nhất.',
          ],
          uiKeys: ['authoring.subFactors', 'authoring.addSubFactor'],
        },
        {
          title: 'Nạp kho nhận xét mẫu',
          body: [
            'Dán vào đây những câu nhận xét bạn vẫn hay viết cho học viên, gắn nhãn khen hoặc góp ý, và chọn nó thuộc tiêu chí nào.',
            'AI sẽ bám theo văn phong của những câu này, nên nhận xét trả về nghe giống giáo viên của trung tâm chứ không giống máy.',
          ],
          uiKeys: ['authoring.commentBank', 'authoring.addComment'],
        },
        {
          title: 'Xem trước prompt gửi AI',
          body: [
            'Khung bên phải hiển thị đúng đoạn văn bản mà AI sẽ nhận được, cập nhật ngay khi bạn gõ.',
            'Hãy đọc lướt trước khi lưu. Nếu bạn thấy đoạn đó khó hiểu hoặc thiếu thông tin thì AI cũng vậy — đây là cách nhanh nhất để biết mình đã viết đủ rõ chưa.',
          ],
          uiKeys: ['authoring.preview'],
        },
        {
          title: 'Lưu lại',
          body: [
            'Bấm Lưu. Hệ thống tạo một phiên bản mới và giữ nguyên các phiên bản cũ.',
          ],
          uiKeys: ['criteria.save'],
        },
      ],
      callout: {
        kind: 'warn',
        text: 'Trường nào hiện ổ khóa là do cấu trúc đã khóa — muốn đổi thì sang drawer Cấu trúc chấm điểm, hoặc nhờ người có quyền đó. Riêng tiêu chí "pronunciation" luôn có mặt và không xóa được.',
      },
    },

    after: {
      heading: '6. Sau khi lưu thì điều gì xảy ra',
      intro: ['Bạn không phải kích hoạt gì thêm. Cụ thể:'],
      terms: [
        { term: 'Bài nộp mới', desc: 'Mọi bài của khóa học đó từ lúc này sẽ được chấm theo phiên bản mới nhất.' },
        { term: 'Bài đã chấm', desc: 'Giữ nguyên phiên bản tiêu chí lúc chấm. Sửa tiêu chí không làm đổi điểm của bài cũ.' },
        { term: 'Lớp bật Tự động gửi', desc: 'Nhận xét gửi thẳng cho học viên ngay sau khi chấm xong.' },
        { term: 'Lớp tắt Tự động gửi', desc: 'Bài chờ ở màn Bài nộp; giáo viên đọc, sửa lại nhận xét nếu cần, rồi bấm gửi.' },
      ],
      callout: {
        kind: 'tip',
        text: 'Công tắc Tự động gửi nằm ở bảng Cấu hình theo lớp, ngay dưới trang Tiêu chí. Khi mới soạn xong một bộ tiêu chí, nên tắt tự động gửi vài ngày để đọc thử vài bài trước đã.',
      },
    },

    trouble: {
      heading: '7. Gặp lỗi thì xử lý thế nào',
      intro: ['Các thông báo hay gặp và cách xử lý:'],
      terms: [
        {
          term: '"Phải có một tiêu chí với khóa pronunciation"',
          desc: 'Cấu trúc đang thiếu tiêu chí phát âm. Sang drawer Cấu trúc chấm điểm, thêm một tiêu chí có khóa đúng là "pronunciation" (chữ thường, không dấu).',
        },
        {
          term: '"Hở khoảng trước cấp độ #…"',
          desc: 'Bảng cấp độ bị đứt quãng — ví dụ một cấp kết thúc ở 10 mà cấp tiếp theo lại bắt đầu ở 12, nên tổng 11 điểm không rơi vào cấp nào. Sửa cho các khoảng nối liền nhau.',
        },
        {
          term: '"Khóa (key) đã tồn tại"',
          desc: 'Đã có cấu trúc khác dùng khóa này rồi. Con trỏ sẽ tự nhảy về ô Khóa — chỉ cần đặt một khóa khác.',
        },
        {
          term: 'Không thấy nút Cấu trúc hoặc nút Soạn nội dung',
          desc: 'Tài khoản của bạn chưa có quyền tương ứng. Xem lại mục 3 và nhờ quản trị viên cấp quyền.',
        },
        {
          term: 'Khung xem trước prompt trống',
          desc: 'Thường là do chưa chọn cấu trúc, hoặc chưa nhập nội dung nào. Chọn cấu trúc và gõ thử một mô tả mức điểm là khung sẽ hiện ra.',
        },
        {
          term: 'Đóng nhầm cửa sổ khi đang soạn dở',
          desc: 'Hệ thống luôn hỏi lại trước khi đóng nếu bạn đang có thay đổi chưa lưu — kể cả khi bấm phím Esc hay bấm ra vùng nền bên ngoài.',
        },
      ],
    },
  },
};

export const guideEn: GuideContent = {
  title: 'Guide: authoring grading criteria',
  lead: 'This page walks through the whole flow, from building a grading structure to authoring the grading content for a course. No technical knowledge needed — just follow the order.',
  tocHeading: 'Contents',

  sections: {
    overview: {
      heading: '1. What this system does',
      intro: [
        'Students send a speaking clip (usually around 5 minutes) over Zalo. The system receives it, has an AI grade it against your course criteria, then sends feedback back to the student.',
        'Four steps happen:',
      ],
      terms: [
        { term: 'Step 1 — Student submits', desc: 'The student sends a clip to the centre’s Zalo OA. The system picks it up automatically; nobody has to click anything.' },
        { term: 'Step 2 — AI grades', desc: 'The AI listens to the clip and grades it against the criteria you authored for that course. This is why authoring matters: how well the AI grades depends on what you write.' },
        { term: 'Step 3 — Teacher reviews', desc: 'If the class has auto-send switched OFF, the submission waits on the Submissions screen for a teacher to read it, edit the feedback, and send.' },
        { term: 'Step 4 — Sent to the student', desc: 'Feedback goes back over Zalo. The system never messages parents and never nags students to submit.' },
      ],
      callout: {
        kind: 'tip',
        text: 'AI feedback is daily practice for students. It does not replace a teacher’s official marks.',
      },
    },

    concepts: {
      heading: '2. The two things you author, and how they differ',
      intro: [
        'This is the part people most often mix up, so read it once carefully and everything afterwards goes quickly. Authoring is split into two layers:',
      ],
      terms: [
        {
          term: 'Grading structure — the frame',
          desc: 'Defines how many criteria a submission is graded on, what the scale runs from and to, whether scores are summed or averaged, and which total maps to which level. Think of it as a BLANK SCORING SHEET.',
        },
        {
          term: 'Grading content — what you write into the frame',
          desc: 'For each criterion: what each score level actually means, which sub-factors to watch, and a bank of sample comments in your centre’s voice. This is WHAT YOU WRITE ON THE SHEET.',
        },
      ],
      callout: {
        kind: 'tip',
        text: 'Why split them? So every class in a course grades on the same scale and the numbers stay comparable — and so you can reword descriptions without accidentally changing the scale. A structure is usually built once and reused for a long time; content is the part you edit regularly.',
      },
    },

    who: {
      heading: '3. Who can do what',
      intro: ['The two layers map to two separate privileges. Administrators always have both.'],
      terms: [
        { term: 'The "rubric_template" privilege', desc: 'Build, edit, duplicate and delete grading STRUCTURES. Usually given to a head of department or curriculum designer.' },
        { term: 'The "criteria_author" privilege', desc: 'Author grading CONTENT for a course, and upload .docx files. Usually given to the teacher who owns the course.' },
      ],
      callout: {
        kind: 'warn',
        text: 'Can’t see the button you need? It is almost always a missing privilege rather than a fault. Ask an administrator to tick the right privilege for your account on the Users screen — it takes effect immediately, with no need to log out and back in.',
      },
    },

    structure: {
      heading: '4. Building a grading structure',
      intro: [
        'Requires the "rubric_template" privilege. If your centre already has a suitable structure, skip this section and go straight to section 5.',
      ],
      steps: [
        {
          title: 'Open the structure list',
          body: ['Go to Criteria in the left sidebar, then click the button that opens the structure list.'],
          uiKeys: ['nav.criteria', 'templates.open'],
        },
        {
          title: 'Choose how to start',
          body: [
            'Two structures ship by default: Cambridge Young Learners (5 criteria, scale 0–5, summed to 25 then converted to a level) and IELTS Speaking (4 criteria, scale 0–9, averaged).',
            'You have three options: use a default as-is; click Duplicate to make your own variant while leaving the original untouched; or click New structure to build from scratch.',
          ],
          uiKeys: ['templates.duplicate', 'templates.new'],
          callout: {
            kind: 'tip',
            text: 'If you only need a few changes from an existing default, Duplicate rather than rebuilding — it is faster and less error-prone.',
          },
        },
        {
          title: 'Fill in the basics and the scale',
          body: [
            'Set the Key — a short code that cannot be changed after creation — and a Name people will recognise.',
            'Choose the scale: minimum, maximum and step. Cambridge is 0 to 5 step 1; IELTS is 0 to 9 step 1.',
            'Choose how totals are computed: Sum (add the criteria up) or Average. The Maximum total shown beside it updates live so you can sanity-check it.',
          ],
          uiKeys: ['templates.scale', 'templates.aggregationMethod'],
        },
        {
          title: 'Declare the criteria',
          body: [
            'Each criterion has a machine key (lowercase, no spaces, e.g. "fluency") and a display label people read (e.g. "Fluency").',
            'One criterion keyed exactly "pronunciation" is mandatory. That is a system rule and cannot be skipped.',
          ],
          uiKeys: ['templates.addDimension', 'templates.dimKey', 'templates.dimLabel'],
        },
        {
          title: 'Set up the level table (if you want one)',
          body: [
            'This converts a total into a level — for example 0–10 Pre-starter, 11–15 Starter, 16–20 Mover, 21–25 Flyer.',
            'The ranges must be contiguous and cover everything from 0 to the maximum total. Gaps or overlaps are reported right below as you type.',
            'If you do not need level conversion, just leave the table empty.',
          ],
          uiKeys: ['templates.levels', 'templates.addLevel'],
        },
        {
          title: 'Choose outputs and lock fields',
          body: [
            'Outputs decide what the AI must return per criterion: just a Comment, or also a Fix suggestion.',
            'Locking decides what a content author may change. A locked field shows a padlock and is read-only during content authoring — use it to keep the scale and totalling consistent across classes.',
          ],
          uiKeys: ['templates.outputFields', 'templates.locked'],
        },
      ],
      callout: {
        kind: 'warn',
        text: 'The two default structures cannot be deleted — only hidden. In exchange they have a Restore original button that undoes any edit. Structures you create yourself can be deleted, and deleting one does NOT affect any content already authored from it.',
      },
    },

    content: {
      heading: '5. Authoring the grading content',
      intro: ['Requires the "criteria_author" privilege. This is the part teachers do most often.'],
      steps: [
        {
          title: 'Open the authoring drawer',
          body: ['Go to Criteria and click the authoring button. To revise an existing version, click Edit on that version’s row in the list instead.'],
          uiKeys: ['authoring.open'],
        },
        {
          title: 'Pick the course and the structure',
          body: ['Choose the course you are authoring for, then the structure to use as the frame. The fields below rebuild themselves to match it.'],
          uiKeys: ['authoring.courseStep', 'authoring.selectTemplate'],
        },
        {
          title: 'Describe every score level',
          body: [
            'This is the most important part. For each criterion the band grid shows one row per level in the scale — six rows for 0–5, ten rows for 0–9.',
            'In each box, describe what a student at that level sounds like. Every line break you type becomes a separate bullet when it reaches the AI.',
            'The more concrete you are, the closer the AI grades. Compare "Fairly clear pronunciation, small errors that do not affect understanding" with "OK" — the first gives the AI a real boundary; the second gives it nothing.',
          ],
          uiKeys: ['authoring.bands'],
          callout: {
            kind: 'tip',
            text: 'Widening the scale adds new rows and keeps everything you already wrote. Narrowing it moves the now-out-of-range levels into an "Out of current scale" section rather than deleting them.',
          },
        },
        {
          title: 'Add sub-factors (optional)',
          body: [
            'For a complex criterion you can break it down to sharpen the boundaries — for example splitting Fluency into utterance length, hesitation, repetition and connectives.',
            'This is optional, but it is the single best place to help the AI tell two adjacent score levels apart.',
          ],
          uiKeys: ['authoring.subFactors', 'authoring.addSubFactor'],
        },
        {
          title: 'Fill the comment bank',
          body: [
            'Paste in the comments you actually write for students, tag each as praise or suggestion, and assign it to a criterion.',
            'The AI follows the voice of these examples, so the feedback that comes back sounds like your centre’s teachers rather than like a machine.',
          ],
          uiKeys: ['authoring.commentBank', 'authoring.addComment'],
        },
        {
          title: 'Check the AI prompt preview',
          body: [
            'The right-hand panel shows exactly the text the AI will receive, updating as you type.',
            'Skim it before saving. If that text looks vague or incomplete to you, it will to the AI as well — this is the fastest way to tell whether you have written enough.',
          ],
          uiKeys: ['authoring.preview'],
        },
        {
          title: 'Save',
          body: ['Click Save. The system creates a new version and leaves earlier versions untouched.'],
          uiKeys: ['criteria.save'],
        },
      ],
      callout: {
        kind: 'warn',
        text: 'A field showing a padlock was locked by the structure — change it in the Grading structure drawer, or ask someone with that privilege. The "pronunciation" criterion is always present and can never be removed.',
      },
    },

    after: {
      heading: '6. What happens after you save',
      intro: ['Nothing else needs activating. Specifically:'],
      terms: [
        { term: 'New submissions', desc: 'Every submission for that course from now on is graded with the newest version.' },
        { term: 'Already-graded submissions', desc: 'Keep the criteria version they were graded with. Editing criteria never changes past scores.' },
        { term: 'Classes with auto-send ON', desc: 'Feedback goes straight to the student as soon as grading finishes.' },
        { term: 'Classes with auto-send OFF', desc: 'The submission waits on the Submissions screen; a teacher reads it, edits the feedback if needed, then sends.' },
      ],
      callout: {
        kind: 'tip',
        text: 'The auto-send switch is in the per-class configuration table lower down the Criteria page. When you have just authored a new set of criteria, it is worth leaving auto-send off for a few days so you can read a few results first.',
      },
    },

    trouble: {
      heading: '7. Common problems',
      intro: ['Messages you are likely to see, and what to do:'],
      terms: [
        {
          term: '"Must have a criterion keyed pronunciation"',
          desc: 'The structure is missing the pronunciation criterion. Open the Grading structure drawer and add one keyed exactly "pronunciation" (lowercase).',
        },
        {
          term: '"Gap before level #…"',
          desc: 'The level table has a hole — one level ends at 10 and the next starts at 12, so a total of 11 maps to nothing. Make the ranges join up.',
        },
        {
          term: '"Template key already exists"',
          desc: 'Another structure already uses that key. The cursor jumps back to the Key field — just choose a different one.',
        },
        {
          term: 'The structure or authoring button is missing',
          desc: 'Your account does not have the matching privilege. See section 3 and ask an administrator to grant it.',
        },
        {
          term: 'The prompt preview is empty',
          desc: 'Usually no structure has been selected yet, or nothing has been typed. Pick a structure and write one band description and it will appear.',
        },
        {
          term: 'You closed the drawer mid-edit',
          desc: 'The system always asks before closing if you have unsaved changes — including when you press Esc or click the backdrop.',
        },
      ],
    },
  },
};
