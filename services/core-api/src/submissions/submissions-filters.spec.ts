import { buildWhere } from './submissions.service';

/**
 * Bộ lọc màn Bài nộp. `buildWhere` là hàm THUẦN nên kiểm được toàn bộ tổ hợp mà không cần DB.
 *
 * Hai bất biến quan trọng nhất:
 *  1. Không truyền gì ⇒ `undefined` — hành vi y hệt trước khi có bộ lọc, không thêm điều kiện
 *     nào vào truy vấn đang chạy.
 *  2. Ngày `to` phải BAO GỒM cả ngày đó. Nếu không, chọn from=to=hôm nay sẽ trả rỗng vì mọi
 *     bài đều có giờ > 00:00 — người dùng sẽ tưởng hệ thống mất dữ liệu.
 */
describe('buildWhere', () => {
  it('không có bộ lọc nào ⇒ undefined (giữ nguyên truy vấn cũ)', () => {
    expect(buildWhere({})).toBeUndefined();
  });

  it('chuỗi rỗng / chỉ khoảng trắng ⇒ bị bỏ qua như không truyền', () => {
    expect(buildWhere({ status: '', q: '   ', className: '', kind: '', from: '', to: '' })).toBeUndefined();
  });

  it('lọc theo trạng thái', () => {
    expect(buildWhere({ status: 'awaiting_review' })).toEqual({ AND: [{ status: 'awaiting_review' }] });
  });

  it('cắt khoảng trắng thừa quanh giá trị', () => {
    expect(buildWhere({ status: '  sent  ' })).toEqual({ AND: [{ status: 'sent' }] });
  });

  it('lọc theo lớp đi qua quan hệ student', () => {
    expect(buildWhere({ className: '10A' })).toEqual({ AND: [{ student: { className: '10A' } }] });
  });

  it('q tìm đồng thời họ tên / mã HV / SĐT, không phân biệt hoa thường', () => {
    const where = buildWhere({ q: 'nam' });
    expect(where).toEqual({
      AND: [
        {
          student: {
            is: {
              OR: [
                { fullName: { contains: 'nam', mode: 'insensitive' } },
                { code: { contains: 'nam', mode: 'insensitive' } },
                { phone: { contains: 'nam' } },
              ],
            },
          },
        },
      ],
    });
  });

  it('khoảng ngày: from lấy từ 00:00, to lấy tới HẾT ngày (lt = hôm sau)', () => {
    const where = buildWhere({ from: '2026-09-01', to: '2026-09-06' });
    const clause = (where as { AND: { receivedAt: { gte: Date; lt: Date } }[] }).AND[0];
    expect(clause.receivedAt.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(clause.receivedAt.lt.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('from = to = cùng một ngày ⇒ vẫn bao trọn ngày đó', () => {
    const where = buildWhere({ from: '2026-09-06', to: '2026-09-06' });
    const clause = (where as { AND: { receivedAt: { gte: Date; lt: Date } }[] }).AND[0];
    expect(clause.receivedAt.lt.getTime() - clause.receivedAt.gte.getTime()).toBe(24 * 3600 * 1000);
  });

  it('chỉ có from (không có to)', () => {
    const where = buildWhere({ from: '2026-09-01' });
    const clause = (where as { AND: { receivedAt: Record<string, unknown> }[] }).AND[0];
    expect(Object.keys(clause.receivedAt)).toEqual(['gte']);
  });

  it('ngày gõ sai ⇒ BỎ QUA điều kiện ngày thay vì ném 500 lên màn hình', () => {
    expect(buildWhere({ from: 'hôm qua' })).toBeUndefined();
    expect(buildWhere({ status: 'sent', to: '32/13/2026' })).toEqual({ AND: [{ status: 'sent' }] });
  });

  it('nhiều bộ lọc cùng lúc ⇒ AND tất cả', () => {
    const where = buildWhere({ status: 'sent', className: '10A', kind: 'audio', q: 'Nam', from: '2026-09-01' });
    expect((where as { AND: unknown[] }).AND).toHaveLength(5);
  });
});
