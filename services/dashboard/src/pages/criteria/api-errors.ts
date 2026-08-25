import { TFunction } from 'i18next';
import { ApiError } from '../../api/client';
import type { LevelIssue } from '../../lib/rubric';

/**
 * Shared error-surfacing for both F12 drawers (FR-22). Maps an `ApiError` (or a raw network
 * failure) to a localized heading + optional verbatim server detail, per the exact table in
 * F12-ba.md §4 / AC-22.1…22.7. Never returns `ApiError.message` (the synthesized
 * `"POST /x failed: 409"` string) or a stack — only `serverMessage`/`issues` straight off the
 * parsed body, or a purely localized heading with no server text at all.
 */
export interface ApiErrorDescription {
  heading: string;
  /** Verbatim per-issue server messages (400 `{message:'invalid rubric', issues:[...]}`). */
  issues: string[];
  /** Verbatim server message shown under the heading (400 DTO / 409 unmapped / other). */
  detail?: string;
  /** For 400 `invalid rubric`, the level-table row index each issue targets, when known. */
  issueIndexes?: (number | undefined)[];
}

const CONFLICT_KEYS: Record<string, string> = {
  'template key already exists': 'errors.conflictDuplicateKey',
  'system templates cannot be deleted': 'errors.conflictSystemDelete',
  'reset is only available for system templates': 'errors.conflictResetOrdinary',
  'no seed definition for this template': 'errors.conflictNoSeed',
};

interface RawIssue {
  code?: unknown;
  index?: unknown;
  message?: unknown;
}

export function describeApiError(err: unknown, t: TFunction): ApiErrorDescription {
  if (!(err instanceof ApiError)) {
    return { heading: t('errors.network'), issues: [] };
  }

  if (err.status === 400) {
    const body = err.body as { message?: unknown; issues?: unknown } | undefined;
    if (body && body.message === 'invalid rubric' && Array.isArray(body.issues)) {
      const raw = body.issues as RawIssue[];
      const issues = raw
        .filter((i): i is RawIssue & { message: string } => typeof i?.message === 'string')
        .map((i) => i.message);
      const issueIndexes = raw.map((i) => (typeof i.index === 'number' ? i.index : undefined));
      return { heading: t('errors.invalidRubric'), issues, issueIndexes };
    }
    // DEF-6 fix: Nest's ValidationPipe (class-validator DTO failures, e.g. `title` over 200
    // chars) returns `message` as an ARRAY of strings, not a single string — `ApiError.serverMessage`
    // is only ever set for a *string* `message` (AC-08.1), so that array was silently dropped and
    // only the bare heading rendered. Surface it as the `issues` list instead, same as the
    // `invalid rubric` branch above.
    if (body && Array.isArray(body.message)) {
      const issues = body.message.filter((m): m is string => typeof m === 'string');
      return { heading: t('errors.invalidRubric'), issues };
    }
    return { heading: t('errors.invalidRubric'), issues: [], detail: err.serverMessage };
  }
  if (err.status === 401) return { heading: t('errors.unauthorized'), issues: [] };
  if (err.status === 403) return { heading: t('errors.forbidden'), issues: [] };
  if (err.status === 404) return { heading: t('errors.notFound'), issues: [] };
  if (err.status === 409) {
    const key = err.serverMessage ? CONFLICT_KEYS[err.serverMessage] : undefined;
    if (key) return { heading: t(key), issues: [] };
    return { heading: t('errors.conflictGeneric'), issues: [], detail: err.serverMessage };
  }
  if (err.status === 413) return { heading: t('errors.payloadTooLarge'), issues: [] };
  return { heading: t('errors.server'), issues: [] };
}

/** Localizes an advisory `LevelIssue` from `lib/rubric.ts::levelIssues` (client port — never a
 * server string). Row numbers are shown 1-based to match `templates.removeLevel`-style UI text. */
export function levelIssueText(issue: LevelIssue, t: TFunction): string {
  return t(`templates.issue.${issue.code}`, {
    index: issue.index + 1,
    prev: issue.prev,
    next: issue.next,
  });
}
