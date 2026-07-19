import { createHash } from 'crypto';
import { computeZaloMac, verifyZaloSignature } from './zalo-signature';

describe('zalo-signature', () => {
  const appId = '1234567890';
  const rawBody = '{"event_name":"user_send_text","timestamp":"1721000000000"}';
  const timestamp = '1721000000000';
  const secret = 'oa-secret-key';
  const expected = createHash('sha256').update(appId + rawBody + timestamp + secret).digest('hex');

  it('computes sha256(appId + body + timestamp + secret)', () => {
    expect(computeZaloMac(appId, rawBody, timestamp, secret)).toBe(expected);
  });

  it('accepts a valid signature with mac= prefix', () => {
    expect(verifyZaloSignature(`mac=${expected}`, appId, rawBody, timestamp, secret)).toBe(true);
  });

  it('accepts a valid signature without prefix', () => {
    expect(verifyZaloSignature(expected, appId, rawBody, timestamp, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyZaloSignature(`mac=${expected}`, appId, rawBody + 'x', timestamp, secret)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyZaloSignature(undefined, appId, rawBody, timestamp, secret)).toBe(false);
  });
});
