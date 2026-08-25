import { buildReplyButtons } from './outbound-buttons';

/** Rubric v2 tối thiểu — `student_reply` được `normalizeRubric` chép nguyên văn. */
function rubricWith(buttons: unknown): unknown {
  return {
    schema_version: 2,
    course_key: 'basic',
    dimensions: [{ key: 'pronunciation', label: 'Phát âm', weight: 1, bands: {} }],
    student_reply: { show_total: true, show_level: true, template: '{{feedback}}', buttons },
  };
}

describe('buildReplyButtons (F11 FR-07/FR-08 producer)', () => {
  it('AC-07.2 — maps {title, action} to a #ilm:<action>:<gradingId> payload', () => {
    const buttons = buildReplyButtons(
      rubricWith([
        { title: 'Em đã xem', action: 'ack' },
        { title: 'Nhờ cô giải thích thêm', action: 'request_advisor' },
      ]),
      123,
    );
    expect(buttons).toEqual([
      { title: 'Em đã xem', action: 'ack', payload: '#ilm:ack:123' },
      { title: 'Nhờ cô giải thích thêm', action: 'request_advisor', payload: '#ilm:request_advisor:123' },
    ]);
  });

  it('AC-07.3 — select_student authored by a teacher is skipped (system-generated only)', () => {
    const buttons = buildReplyButtons(
      rubricWith([
        { title: 'Chọn học viên', action: 'select_student' },
        { title: 'Em đã xem', action: 'ack' },
      ]),
      1,
    );
    expect(buttons).toEqual([{ title: 'Em đã xem', action: 'ack', payload: '#ilm:ack:1' }]);
  });

  it('AC-07.3 — an unknown action is skipped; skipping everything yields an empty list', () => {
    expect(buildReplyButtons(rubricWith([{ title: 'Xóa tài khoản', action: 'delete_account' }]), 1)).toEqual([]);
  });

  it.each([
    ['student_reply null', { schema_version: 2, student_reply: null }],
    ['no buttons key', { schema_version: 2, student_reply: { show_total: true } }],
    ['buttons not a list', rubricWith('ack')],
    ['buttons empty', rubricWith([])],
    ['rubric null', null],
    ['rubric a string', 'không phải rubric'],
    ['rubric an array', []],
  ])('AC-07.4/08.4 — %s degrades to no buttons without throwing', (_label, rubric) => {
    expect(buildReplyButtons(rubric, 1)).toEqual([]);
  });

  it.each([
    ['entry not an object', 'ack'],
    ['entry is null', null],
    ['title missing', { action: 'ack' }],
    ['title not a string', { title: 7, action: 'ack' }],
    ['title empty after trim', { title: '   ', action: 'ack' }],
    ['title over 100 chars', { title: 'x'.repeat(101), action: 'ack' }],
    ['action missing', { title: 'Em đã xem' }],
    ['action not a string', { title: 'Em đã xem', action: 3 }],
  ])('AC-07.5 — a malformed entry (%s) is skipped, never raised', (_label, bad) => {
    const buttons = buildReplyButtons(rubricWith([bad, { title: 'Em đã xem', action: 'ack' }]), 9);
    expect(buttons).toEqual([{ title: 'Em đã xem', action: 'ack', payload: '#ilm:ack:9' }]);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', '99'],
    ['a float', 1.5],
    ['zero', 0],
    ['negative', -1],
  ])('AC-07.6 — a grading id that is %s produces NO buttons (never "#ilm:ack:undefined")', (_l, id) => {
    expect(buildReplyButtons(rubricWith([{ title: 'Em đã xem', action: 'ack' }]), id)).toEqual([]);
  });

  it('AC-07.7 — a longer config list is truncated to the first 5 at the producer', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: `nút ${i}`, action: 'ack' }));
    const buttons = buildReplyButtons(rubricWith(many), 5);
    expect(buttons).toHaveLength(5);
    expect(buttons[0].title).toBe('nút 0');
    expect(buttons[4].title).toBe('nút 4');
  });

  it('BR-06 — every produced payload matches the closed grammar (digits only, no teacher text)', () => {
    const buttons = buildReplyButtons(
      rubricWith([{ title: 'Em; đã: xem #ilm:ack:999', action: 'ack' }]),
      42,
    );
    expect(buttons[0].payload).toBe('#ilm:ack:42');
    expect(buttons[0].payload).toMatch(/^#ilm:(ack|request_advisor):[0-9]{1,12}$/);
  });
});
