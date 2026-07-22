import { ForbiddenException } from '@nestjs/common';
import { resolve, sep } from 'path';

export const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? '/data/media');

/** Chặn path traversal — mediaPath luôn phải nằm trong MEDIA_ROOT (mục 3.8). */
export function resolveMediaPath(mediaPath: string): string {
  const filePath = resolve(MEDIA_ROOT, mediaPath);
  if (!filePath.startsWith(MEDIA_ROOT + sep) && filePath !== MEDIA_ROOT) {
    throw new ForbiddenException('invalid media path');
  }
  return filePath;
}
