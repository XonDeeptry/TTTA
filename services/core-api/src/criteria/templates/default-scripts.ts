/**
 * Kịch bản nhận xét MẶC ĐỊNH cho hai cấu trúc chấm điểm hệ thống — 3 kịch bản / tiêu chí × band.
 *
 * Học thuật ILM 2026-10-03: (1) nhận xét quá "nịnh", (2) mọi bài cùng band nhận gần như cùng một câu.
 * Học thuật không quen IT nên hệ thống SINH SẴN 3 kịch bản cho mỗi ô; học thuật chỉ việc đọc và sửa ở
 * màn "Kịch bản nhận xét". Lúc chấm, worker bốc NGẪU NHIÊN một kịch bản mỗi ô làm mẫu văn phong
 * (`grading-worker/.../comment_scripts.py`) — mô hình viết lại cho đúng bài, không chép nguyên văn.
 *
 * Ba kịch bản của một ô cố ý khác CẤU TRÚC, không chỉ khác chữ:
 *   1. lỗi chính → ví dụ → ảnh hưởng tới người nghe
 *   2. còn thiếu gì để lên band trên → ví dụ
 *   3. một điểm làm được (ngắn, cụ thể) → nhưng lỗi chính → ví dụ
 * `[…]` là chỗ hệ thống chèn ví dụ THẬT trích từ bài. Không lời khen chung chung. IELTS gọi "em";
 * thiếu nhi gọi "con" (giáo viên thiếu nhi viết "con" 131/131 lần khi sửa nhận xét, 2026-10-03).
 *
 * Đây cũng là nội dung "Khôi phục bản gốc" trả về (seed), nên sửa ở đây là sửa mặc định cho
 * cài đặt mới — KHÔNG đụng tới bản học thuật đã sửa trên pilot.
 */
import type { CommentBankEntry } from '../rubric-schema';

type ScriptTable = Record<string, Record<string, [string, string, string]>>;

const IELTS: ScriptTable = {
  fluency_coherence: {
    '3': [
      'Em dừng rất lâu để tìm từ gần như ở mọi câu, ví dụ [đoạn em dừng]; người nghe khó theo được ý em muốn nói.',
      'Để lên band 4, em cần nói được những câu nối tiếp nhau mà không dừng giữa câu để tìm từ. Hiện tại em mới trả lời được rất ngắn, như [câu trả lời của em].',
      'Em đã cố trả lời câu hỏi, nhưng các câu còn rời rạc, gần như không có từ nối, ví dụ [đoạn em nói]; ý chính chưa truyền tải được.',
    ],
    '4': [
      'Em dừng và lặp lại nhiều lần trong cùng một câu, ví dụ [đoạn em lặp]; nhịp nói vì thế bị đứt quãng liên tục.',
      'Để lên band 5, em cần giữ được mạch nói lâu hơn và bớt tự sửa giữa câu. Hiện em vẫn dừng để tìm từ cơ bản, như [chỗ em dừng].',
      'Em có dùng từ nối, nhưng chỉ lặp đi lặp lại một vài từ như [từ nối em dùng], và các ý chưa được nối thành một mạch rõ ràng.',
    ],
    '5': [
      'Em nói được liên tục nhưng phải chậm lại và tự sửa khá thường xuyên, ví dụ [đoạn em tự sửa]; người nghe phải chờ em tìm từ.',
      'Để lên band 6, em cần kéo dài câu trả lời mà không ngập ngừng vì từ vựng cơ bản. Hiện em vẫn dừng ở những chỗ như [chỗ em dừng].',
      'Em biết dùng từ nối như [từ nối em dùng], nhưng dùng quá nhiều và chưa đúng chỗ, nên phần ý phức tạp như [ý đó] nghe vẫn chưa trôi.',
    ],
    '6': [
      'Em kéo dài được câu trả lời, nhưng mạch ý bị đứt khi em lặp lại và tự sửa, ví dụ [đoạn em lặp/tự sửa].',
      'Để lên band 7, em cần nói dài mà không phải cố gắng nhiều và dùng từ nối linh hoạt hơn. Hiện có chỗ từ nối chưa hợp, như [từ nối dùng sai].',
      'Em có ý muốn nói dài và nối ý bằng [từ nối em dùng], nhưng các khoảng ngập ngừng giữa câu như [chỗ ngập ngừng] làm bài nói chưa mạch lạc.',
    ],
    '7': [
      'Em nói dài khá dễ dàng, nhưng vẫn ngập ngừng để tìm từ ở chỗ [chỗ ngập ngừng]; đó là điều còn ngăn em lên band 8.',
      'Để lên band 8, phần ngập ngừng cần đến từ việc nghĩ ý chứ không phải tìm từ hay ngữ pháp. Ví dụ ở [đoạn đó] em dừng vì thiếu từ.',
      'Em dùng từ nối khá đa dạng như [từ nối], nhưng vẫn có chỗ tự sửa giữa câu, như [đoạn tự sửa], làm nhịp nói chậm lại.',
    ],
    '8': [
      'Em nói trôi chảy, nhưng còn một vài chỗ lặp lại không cần thiết, như [đoạn lặp]; đó là chỗ cần gọt để đạt band 9.',
      'Để đạt band 9, mọi khoảng dừng phải là dừng để nghĩ ý. Ở [đoạn đó] em vẫn dừng để chọn từ.',
      'Em phát triển chủ đề mạch lạc, nhưng phần chuyển ý ở [chỗ chuyển ý] còn hơi đột ngột.',
    ],
    '9': [
      'Bài nói trôi chảy và mạch lạc; chỗ duy nhất có thể gọt thêm là [chỗ đó].',
      'Em giữ được mạch nói tự nhiên suốt bài; cách chuyển ý ở [chỗ đó] có thể tinh tế hơn nữa.',
      'Các khoảng dừng của em đều là dừng để nghĩ ý; lưu ý giữ nhịp như vậy cả khi chủ đề khó hơn [chủ đề].',
    ],
  },
  lexical_resource: {
    '3': [
      'Em chỉ dùng được những từ rất đơn giản và lặp lại, như [từ em lặp]; khi sang ý mới em thiếu từ để diễn đạt.',
      'Để lên band 4, em cần đủ từ để nói về chủ đề quen thuộc. Hiện em phải dừng lại khi cần từ như [ý em muốn nói].',
      'Em diễn đạt được thông tin cá nhân đơn giản, nhưng gần như mọi ý khác đều thiếu từ, ví dụ [đoạn đó].',
    ],
    '4': [
      'Em chọn sai từ khá thường xuyên, ví dụ [từ dùng sai] thay vì [từ đúng], nên ý nghĩa câu bị lệch.',
      'Để lên band 5, em cần thử diễn đạt một ý theo cách khác khi thiếu từ. Hiện em lặp lại một từ, như [từ lặp], thay vì tìm cách nói khác.',
      'Em đủ từ cho chủ đề quen thuộc, nhưng khi nói về [chủ đề] em chỉ truyền đạt được ý cơ bản và chọn từ chưa chính xác.',
    ],
    '5': [
      'Em có cố diễn đạt theo nhiều cách nhưng thường chưa thành công, ví dụ [cụm em dùng chưa đúng].',
      'Để lên band 6, em cần dùng từ linh hoạt hơn và đúng ngữ cảnh. Hiện em dùng [từ] ở chỗ cần [từ phù hợp hơn].',
      'Vốn từ của em đủ để nói về chủ đề, nhưng còn ít linh hoạt: [từ] bị lặp lại nhiều lần trong bài.',
    ],
    '6': [
      'Em dùng một số từ chưa phù hợp ngữ cảnh, ví dụ [từ chưa hợp], dù người nghe vẫn hiểu ý.',
      'Để lên band 7, em cần dùng được từ ít phổ biến hơn và collocation tự nhiên. Hiện em dùng [cụm đơn giản] ở chỗ có thể nói [cụm tự nhiên hơn].',
      'Em diễn đạt được ý theo nhiều cách, nhưng [cụm từ] dùng chưa đúng collocation nên nghe chưa tự nhiên.',
    ],
    '7': [
      'Em dùng được từ ít phổ biến, nhưng collocation ở [cụm từ] chưa chính xác; đây là lỗi còn giữ em ở band 7.',
      'Để lên band 8, em cần dùng thành ngữ và từ ít phổ biến một cách khéo léo. Hiện [từ/cụm] được dùng chưa đúng văn phong.',
      'Em có vốn từ khá linh hoạt như [từ em dùng tốt], nhưng [từ dùng sai] vẫn bị chọn sai sắc thái.',
    ],
    '8': [
      'Vốn từ của em phong phú, chỉ còn [cụm từ] dùng chưa thật chính xác.',
      'Để đạt band 9, mọi thành ngữ phải tự nhiên và chính xác. [thành ngữ] trong bài em dùng hơi gượng.',
      'Em dùng từ ít phổ biến khá khéo léo như [từ], nhưng còn [lỗi collocation] cần chỉnh.',
    ],
    '9': [
      'Từ vựng chính xác và tự nhiên trong cả bài; [cụm từ] là chỗ duy nhất có thể chọn từ sắc hơn.',
      'Em dùng thành ngữ tự nhiên, như [thành ngữ]; giữ độ chính xác này cả với chủ đề lạ hơn.',
      'Vốn từ linh hoạt trong mọi ý; lưu ý tránh lặp [từ] khi bài nói dài hơn.',
    ],
  },
  grammatical_range: {
    '3': [
      'Em mắc lỗi ngữ pháp ở gần như mọi câu, ví dụ [câu sai]; chỉ những câu có vẻ học thuộc mới đúng.',
      'Để lên band 4, em cần nói đúng các mẫu câu cơ bản. Hiện câu như [câu sai] còn sai cả thì lẫn trật tự từ.',
      'Em cố dùng câu đơn, nhưng [lỗi cụ thể] lặp lại nhiều lần khiến câu khó hiểu.',
    ],
    '4': [
      'Em nói được câu đơn, nhưng gần như không dùng mệnh đề phụ, và vẫn sai cơ bản như [câu sai].',
      'Để lên band 5, em cần dùng câu cơ bản chính xác hơn và thử câu phức. Hiện lỗi [loại lỗi] xuất hiện ở [câu sai].',
      'Các lượt nói của em còn ngắn và lặp một cấu trúc, như [câu em lặp], và còn sai [lỗi].',
    ],
    '5': [
      'Em có dùng một ít câu phức, nhưng thường sai, ví dụ [câu phức sai]; câu cơ bản thì khá chính xác.',
      'Để lên band 6, em cần dùng đa dạng cấu trúc hơn. Hiện câu phức như [câu đó] vẫn phải sửa giữa chừng.',
      'Câu cơ bản của em dùng hợp lý, nhưng khi thử cấu trúc khó hơn như [câu đó] thì sai [lỗi].',
    ],
    '6': [
      'Em kết hợp được câu ngắn và câu phức, nhưng vẫn sai thường xuyên ở câu phức, ví dụ [câu sai].',
      'Để lên band 7, câu của em cần thường xuyên không có lỗi. Hiện lỗi [loại lỗi] lặp lại ở [câu sai].',
      'Em có dùng [cấu trúc em dùng], nhưng chưa linh hoạt, và [lỗi cụ thể] vẫn xuất hiện nhiều lần.',
    ],
    '7': [
      'Em dùng được nhiều cấu trúc phức tạp, nhưng vẫn còn lỗi như [câu sai]; đây là điều còn giữ em ở band 7.',
      'Để lên band 8, phần lớn câu cần không có lỗi. Ở [câu đó] em còn sai [lỗi].',
      'Em dùng câu phức khá linh hoạt, như [câu đúng], nhưng [lỗi cơ bản] vẫn xuất hiện ở [câu sai].',
    ],
    '8': [
      'Phần lớn câu của em không có lỗi; còn [câu sai] mắc lỗi [lỗi] cần sửa.',
      'Để đạt band 9, cấu trúc phải chính xác nhất quán. [câu đó] còn một lỗi nhỏ về [lỗi].',
      'Em dùng đa dạng cấu trúc linh hoạt, chỉ còn lỗi ngẫu nhiên như [câu sai].',
    ],
    '9': [
      'Cấu trúc chính xác và nhất quán trong cả bài; [câu đó] có thể diễn đạt gọn hơn.',
      'Ngữ pháp chính xác; lưu ý giữ độ chính xác này khi em nói nhanh hơn, như ở [đoạn đó].',
      'Em dùng cấu trúc phức tạp tự nhiên, như [câu đó]; không có lỗi đáng kể.',
    ],
  },
  pronunciation: {
    '3': [
      'Nhiều từ của em bị phát âm sai đến mức khó nhận ra, ví dụ [từ sai]; người nghe phải đoán ý em nói.',
      'Để lên band 4, em cần phát âm đúng các từ đơn quen thuộc. Hiện các từ như [từ sai] còn sai âm chính.',
      'Em phát âm được một vài từ ngắn, nhưng phần lớn từ như [từ sai] sai âm, khiến bài nói khó hiểu.',
    ],
    '4': [
      'Em phát âm sai từ đơn và âm thường xuyên, ví dụ [từ sai], nên bài nói thiếu rõ ràng.',
      'Để lên band 5, em cần kiểm soát ngữ điệu và nhịp tốt hơn. Hiện nhịp nói bị sai ở [đoạn đó] và âm [âm] bị đọc sai ở [từ].',
      'Em có dùng một chút ngữ điệu, nhưng các từ như [từ sai] phát âm sai làm người nghe phải cố gắng mới hiểu.',
    ],
    '5': [
      'Em phát âm rõ nhiều từ, nhưng [từ sai] còn sai âm [âm], và ngữ điệu chưa được kiểm soát ở [đoạn đó].',
      'Để lên band 6, em cần nối cụm từ tự nhiên hơn. Hiện em đọc rời từng từ ở [đoạn đó].',
      'Em đã phát âm đúng các âm cơ bản, nhưng nhịp và trọng âm ở [từ/cụm] còn sai khiến câu nghe thiếu tự nhiên.',
    ],
    '6': [
      'Em nối cụm từ khá phù hợp, nhưng trọng âm sai ở [từ sai] làm lệch nhịp câu.',
      'Để lên band 7, em cần kiểm soát tốt hơn các thành tố phát âm. Hiện [từ sai] sai âm [âm] và câu [đoạn đó] bị đọc quá nhanh.',
      'Em dùng được ngữ điệu ở một số câu, nhưng [từ sai] vẫn sai âm và một số âm đuôi như [âm đuôi] bị bỏ.',
    ],
    '7': [
      'Phần lớn bài nói dễ hiểu, nhưng [từ sai] còn sai âm [âm]; đây là lỗi còn giữ em ở band 7.',
      'Để lên band 8, em cần duy trì nhịp và ngữ điệu linh hoạt trong câu dài. Ở [đoạn đó] ngữ điệu còn đều đều.',
      'Em kiểm soát trọng âm khá tốt, như ở [từ đúng], nhưng [từ sai] vẫn bị đọc sai.',
    ],
    '8': [
      'Bài nói dễ hiểu xuyên suốt; còn [từ sai] thỉnh thoảng sai âm [âm].',
      'Để đạt band 9, cần duy trì độ chính xác cả trong câu dài. Ở [đoạn đó] trọng âm câu chưa chuẩn.',
      'Nhịp và ngữ điệu của em linh hoạt, chỉ còn lỗi nhỏ ở [từ sai].',
    ],
    '9': [
      'Phát âm chính xác và dễ hiểu trong cả bài; [từ] có thể đọc rõ âm đuôi hơn.',
      'Em dùng đầy đủ các thành tố phát âm; giữ độ chính xác này khi nói nhanh, như ở [đoạn đó].',
      'Ngữ điệu và trọng âm tự nhiên; không có lỗi đáng kể ảnh hưởng tới người nghe.',
    ],
  },
};

const CAMBRIDGE: ScriptTable = {
  pronunciation: {
    '1': [
      'Nhiều từ con đọc sai âm đến mức khó nhận ra, ví dụ [từ sai]. Con đọc chậm từng từ theo mẫu nhé.',
      'Con cần đọc đúng các từ quen thuộc trước. Từ [từ sai] con đang đọc sai âm [âm].',
      'Con đã mạnh dạn đọc, nhưng phần lớn từ như [từ sai] còn sai âm nên người nghe khó hiểu.',
    ],
    '2': [
      'Con đọc được từ quen thuộc, nhưng còn sai nhiều, ví dụ [từ sai] đọc thành [cách con đọc].',
      'Để lên mức 3, con cần đọc đúng đa số từ quen thuộc. Từ [từ sai] con cần sửa âm [âm].',
      'Con đọc đúng [từ đúng], nhưng [từ sai] và [từ sai] còn sai âm.',
    ],
    '3': [
      'Con đọc đúng đa số từ quen thuộc, nhưng [từ sai] còn làm người nghe nhầm sang từ khác.',
      'Để lên mức 4, con cần đọc rõ hơn những từ dài. Từ [từ sai] con đang đọc sai âm [âm].',
      'Phần lớn từ con đọc rõ, chỉ còn [từ sai] đọc sai âm [âm].',
    ],
    '4': [
      'Con đọc khá rõ; còn lỗi nhỏ ở [từ sai] (âm [âm]).',
      'Để lên mức 5, con cần sửa nốt các lỗi nhỏ như [từ sai].',
      'Con đọc rõ ràng, chỉ cần chú ý âm [âm] trong [từ sai].',
    ],
    '5': [
      'Con đọc rõ ràng, dễ hiểu; [từ] có thể đọc chuẩn hơn nữa.',
      'Phát âm của con rõ và dễ hiểu; giữ như vậy với những từ mới như [từ].',
      'Con đọc chính xác; lưu ý giữ độ rõ khi đọc nhanh hơn.',
    ],
  },
  intonation: {
    '1': [
      'Giọng con đều đều, không lên xuống, ví dụ câu hỏi [câu] con đọc như câu kể.',
      'Con cần lên giọng ở cuối câu hỏi. Câu [câu] con đang đọc ngang giọng.',
      'Con đọc to, nhưng giọng chưa lên xuống nên khó phân biệt câu hỏi và câu kể.',
    ],
    '2': [
      'Con có thử lên xuống giọng nhưng còn gượng, ví dụ [câu].',
      'Để lên mức 3, con cần đọc có nhịp trong câu. Câu [câu] con đang ngắt sai chỗ.',
      'Con lên giọng được ở [câu đúng], nhưng [câu] vẫn đọc ngang.',
    ],
    '3': [
      'Con dùng được ngữ điệu cơ bản, nhưng chưa nhấn vào từ quan trọng, ví dụ [câu].',
      'Để lên mức 4, con cần nhấn đúng từ quan trọng trong câu, như ở [câu].',
      'Câu của con có nhịp, nhưng [câu] còn đọc đều, chưa thể hiện ý.',
    ],
    '4': [
      'Ngữ điệu của con khá tự nhiên; [câu] có thể nhấn rõ hơn.',
      'Để lên mức 5, con cần đọc biểu cảm hơn ở những câu như [câu].',
      'Con nhấn đúng nhiều chỗ, chỉ [câu] còn đọc hơi đều.',
    ],
    '5': [
      'Ngữ điệu tự nhiên và biểu cảm; giữ như vậy ở câu dài như [câu].',
      'Con đọc biểu cảm tốt; [câu] có thể nhấn mạnh hơn nữa.',
      'Ngữ điệu giúp người nghe hiểu rõ ý con; tiếp tục giữ nhé.',
    ],
  },
  ending_sounds: {
    '1': [
      'Con bỏ gần hết âm cuối, ví dụ [từ] đọc thiếu âm [âm cuối].',
      'Con cần bật âm cuối của từ. [từ] con đang đọc mất âm [âm cuối].',
      'Con đọc được âm đầu, nhưng hầu hết âm cuối như trong [từ] bị bỏ.',
    ],
    '2': [
      'Con đọc được âm cuối /s/ ở vài từ quen, nhưng [từ] vẫn thiếu âm [âm cuối].',
      'Để lên mức 3, con cần chú ý âm cuối /t/, /d/. Từ [từ] con đang bỏ âm cuối.',
      'Con có âm cuối ở [từ đúng], nhưng [từ] và [từ] còn mất âm cuối.',
    ],
    '3': [
      'Con có ý thức đọc âm cuối, nhưng chưa đều, ví dụ [từ] lúc có lúc không.',
      'Để lên mức 4, con cần giữ âm cuối ở mọi từ. Ở [từ] âm [âm cuối] còn bị nuốt.',
      'Con bật âm cuối ở [từ đúng], nhưng [từ] vẫn thiếu âm [âm cuối].',
    ],
    '4': [
      'Đa số âm cuối con đọc đúng; [từ] thỉnh thoảng còn thiếu âm [âm cuối].',
      'Để lên mức 5, con cần giữ âm cuối cả khi đọc nhanh, như ở [từ].',
      'Âm cuối khá rõ, chỉ còn [từ] cần bật âm [âm cuối].',
    ],
    '5': [
      'Con đọc rõ hầu hết âm cuối; giữ như vậy ở [từ].',
      'Âm cuối chuẩn và rõ; lưu ý giữ cả khi đọc câu dài.',
      'Con bật âm cuối tốt; [từ] có thể rõ hơn nữa.',
    ],
  },
  word_stress: {
    '1': [
      'Con đặt trọng âm sai ở nhiều từ, ví dụ [từ] nhấn sai âm tiết.',
      'Con cần nhấn đúng âm tiết của từ. [từ] con đang nhấn vào [âm tiết sai].',
      'Con đọc đủ âm tiết, nhưng trọng âm ở [từ] và [từ] sai.',
    ],
    '2': [
      'Con nhấn đúng một vài từ quen, nhưng [từ] vẫn sai trọng âm.',
      'Để lên mức 3, con cần nhấn đúng các từ đơn giản. [từ] con đang nhấn sai âm tiết.',
      'Con nhấn đúng [từ đúng], nhưng [từ] còn sai.',
    ],
    '3': [
      'Con nhấn đúng đa số từ đơn giản, nhưng [từ] còn sai trọng âm.',
      'Để lên mức 4, con cần nhấn đúng từ dài hơn như [từ].',
      'Trọng âm từ ngắn của con đúng, chỉ [từ] dài hơn còn sai.',
    ],
    '4': [
      'Trọng âm khá chính xác; [từ khó] còn nhấn sai.',
      'Để lên mức 5, con cần nhấn đúng cả cụm từ, như [cụm].',
      'Con nhấn đúng hầu hết từ, chỉ còn [từ] cần sửa.',
    ],
    '5': [
      'Trọng âm chuẩn ở cả từ và cụm; giữ như vậy với từ mới như [từ].',
      'Con nhấn tự nhiên; [cụm] có thể nhấn rõ hơn.',
      'Trọng âm chính xác; tiếp tục giữ khi đọc câu dài.',
    ],
  },
  fluency: {
    '1': [
      'Con chỉ nói được từng từ và dừng lâu giữa các từ, ví dụ [đoạn đó].',
      'Con cần nói được câu ngắn liền mạch. Hiện con dừng sau gần như mỗi từ.',
      'Con đã cố gắng nói, nhưng các từ còn rời nhau, như [đoạn đó].',
    ],
    '2': [
      'Con nói được câu rất ngắn nhưng ngập ngừng nhiều, ví dụ [đoạn đó].',
      'Để lên mức 3, con cần nói trọn câu đơn mà không dừng giữa câu, như ở [câu].',
      'Con nói được [câu ngắn], nhưng các câu sau còn ngắt quãng nhiều.',
    ],
    '3': [
      'Con nói được câu đơn cơ bản, nhưng còn ngắt quãng, ví dụ [đoạn ngắt].',
      'Để lên mức 4, con cần nối các ý bằng từ nối đơn giản như "and", "because". Hiện con dừng giữa [đoạn đó].',
      'Con nói được câu đơn, nhưng các khoảng dừng như [chỗ dừng] làm bài nói chậm.',
    ],
    '4': [
      'Con nói khá trôi chảy; còn ngập ngừng ở [đoạn đó].',
      'Để lên mức 5, con cần nói mượt hơn khi diễn đạt ý dài, như [ý đó].',
      'Con nối ý được bằng [từ nối], chỉ còn [chỗ dừng] hơi ngập ngừng.',
    ],
    '5': [
      'Con nói mượt mà, tự nhiên; giữ như vậy khi chủ đề khó hơn.',
      'Bài nói trôi chảy; [đoạn đó] có thể nối ý tự nhiên hơn nữa.',
      'Con diễn đạt ý trôi chảy; tiếp tục giữ nhịp nói như vậy.',
    ],
  },
  // 2026-10-03: "Content (Đọc đủ & đúng chữ)" — chỉ chấm khi lớp có bài đọc; không vào tổng 25.
  reading_accuracy: {
    '1': [
      'Con mới đọc được một phần nhỏ của bài, bỏ qua [đoạn bị bỏ]. Con cần đọc hết bài từ đầu đến cuối.',
      'Con bỏ phần lớn bài đọc, ví dụ [đoạn bị bỏ]. Lần sau con đọc chậm lại và đọc đủ từng câu.',
      'Bài đọc của con còn thiếu nhiều, như [đoạn bị bỏ]. Con dò theo bài bằng ngón tay để không bỏ sót.',
    ],
    '2': [
      'Con bỏ nhiều từ và cụm, ví dụ [từ bị bỏ], nên một số câu bị sai nghĩa.',
      'Để lên mức 3, con cần đọc đủ các câu như [câu bị thiếu]. Hiện con bỏ cả cụm [từ bị bỏ].',
      'Con đọc thêm hoặc đổi từ, như [từ đọc thêm], làm câu khác với bài. Con đọc đúng chữ trong bài.',
    ],
    '3': [
      'Con theo được nội dung chính, nhưng còn bỏ [từ bị bỏ] và đọc thêm [từ đọc thêm].',
      'Để lên mức 4, con cần đọc đủ các từ nhỏ như [từ bị bỏ]. Hiện con hay bỏ qua những từ này.',
      'Con đọc gần đủ bài, nhưng đổi [từ đọc sai] thành từ khác. Con nhìn kỹ từng chữ trước khi đọc.',
    ],
    '4': [
      'Con đọc gần như đủ bài; chỉ còn bỏ [từ bị bỏ].',
      'Để lên mức 5, con cần đọc đủ cả những từ nhỏ như [từ bị bỏ].',
      'Con đọc đúng hầu hết bài, chỉ đọc thêm [từ đọc thêm]. Con bám sát chữ trong bài.',
    ],
    '5': [
      'Con đọc đủ và đúng toàn bộ bài, không bỏ từ nào; giữ như vậy với bài dài hơn.',
      'Con đọc đủ từng chữ trong bài; tiếp tục đọc cẩn thận như vậy.',
      'Bài đọc đủ và đúng chữ; lần sau con giữ độ chính xác này khi đọc nhanh hơn.',
    ],
  },
};

function flatten(table: ScriptTable): CommentBankEntry[] {
  const out: CommentBankEntry[] = [];
  for (const [dimension, bands] of Object.entries(table)) {
    for (const [band, scripts] of Object.entries(bands)) {
      for (const text of scripts) out.push({ dimension, band, intent: null, text });
    }
  }
  return out;
}

export const IELTS_DEFAULT_SCRIPTS: readonly CommentBankEntry[] = Object.freeze(flatten(IELTS));
export const CAMBRIDGE_DEFAULT_SCRIPTS: readonly CommentBankEntry[] = Object.freeze(flatten(CAMBRIDGE));
