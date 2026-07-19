import { createHash, timingSafeEqual } from 'crypto';

/**
 * Zalo OA webhook signature (header X-ZEvent-Signature):
 *   mac=sha256(appId + rawBody + timestamp + oaSecretKey)
 */
export function computeZaloMac(appId: string, rawBody: string, timestamp: string, oaSecret: string): string {
  return createHash('sha256').update(`${appId}${rawBody}${timestamp}${oaSecret}`).digest('hex');
}

export function verifyZaloSignature(
  signatureHeader: string | undefined,
  appId: string,
  rawBody: string,
  timestamp: string,
  oaSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const received = signatureHeader.startsWith('mac=') ? signatureHeader.slice(4) : signatureHeader;
  const expected = computeZaloMac(appId, rawBody, timestamp, oaSecret);
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
