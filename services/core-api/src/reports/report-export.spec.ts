import { toCsv, toXlsxBuffer } from './report-export';

describe('toCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('builds a header row from the first row keys', () => {
    const csv = toCsv([{ a: 1, b: 'x' }]);
    expect(csv).toBe('a,b\n1,x');
  });

  it('escapes values containing commas, quotes, or newlines', () => {
    const csv = toCsv([{ note: 'has, a comma' }, { note: 'has "quotes"' }]);
    expect(csv).toBe('note\n"has, a comma"\n"has ""quotes"""');
  });

  it('serializes dynamic pilot-comparison dimension columns', () => {
    const csv = toCsv([
      { submissionId: 7, className: '10A', audio_fluency: 3, text_fluency: 2, delta_fluency: 1 },
    ]);
    expect(csv).toBe('submissionId,className,audio_fluency,text_fluency,delta_fluency\n7,10A,3,2,1');
  });
});

describe('toXlsxBuffer', () => {
  it('produces a non-empty buffer with the given rows', async () => {
    const buffer = await toXlsxBuffer([{ date: '2026-07-20', totalUsd: 1.23 }], 'test-sheet');
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles an empty row set without throwing', async () => {
    const buffer = await toXlsxBuffer([], 'empty-sheet');
    expect(buffer.length).toBeGreaterThan(0);
  });
});
