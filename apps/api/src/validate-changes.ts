import { DAY_IN_MS } from '@cuewise/shared';
import { z } from 'zod/mini';
import type { ValidationIssue } from './problem-details';
import type { PushRecord } from './store';

export const MAX_BATCH_SIZE = 100;
export const MAX_CIPHERTEXT_BYTES = 65536;
export const MAX_COLLECTION_LENGTH = 64;
export const MAX_ENTITY_ID_LENGTH = 128;
// Catches a device with a wildly-wrong clock before its bad HLC pollutes other devices.
export const MAX_CLOCK_DRIFT_MS = DAY_IN_MS;

type PushBodyProblem = {
  problemCode: 'invalid_request' | 'batch_too_large' | 'invalid_record';
  issues: ValidationIssue[];
};

const encoder = new TextEncoder();

/**
 * Byte length, not `value.length` (UTF-16 code units), for both bounds — one metric, so a
 * multi-byte-heavy string cannot pass a check sized for its serialized cost.
 */
function withinBytes(max: number) {
  // `unknown` in, because a check also runs for a value that failed the type test above it.
  return z.refine(
    (value: unknown) => typeof value !== 'string' || encoder.encode(value).length <= max,
    { error: `must not exceed ${max} bytes` }
  );
}

function boundedString(max: number) {
  // The message sits on the type check as well as the length check: a missing field fails
  // `z.string()` first, and zod would otherwise answer its own "Invalid input".
  return z
    .string({ error: 'required non-empty string' })
    .check(z.minLength(1, { error: 'required non-empty string' }), withinBytes(max));
}

/**
 * The messages here are not decoration. They are copied verbatim into problem+json
 * `errors[]`, which clients parse to tell a user which record to fix, so each one is part
 * of the API surface — `validate-changes.test.ts` pins every string below.
 */
function recordSchema(nowMs: number) {
  return z.object({
    collection: boundedString(MAX_COLLECTION_LENGTH),
    entityId: boundedString(MAX_ENTITY_ID_LENGTH),
    ciphertext: z.string({ error: 'required string' }).check(withinBytes(MAX_CIPHERTEXT_BYTES)),
    clientUpdatedAt: z.number({ error: 'required finite number' }).check(
      z.refine((value: number) => Number.isFinite(value), { error: 'required finite number' }),
      z.refine((value: number) => Math.abs(value - nowMs) <= MAX_CLOCK_DRIFT_MS, {
        error: 'client clock drift too large',
      })
    ),
    deleted: z.boolean({ error: 'required boolean' }),
  });
}

const pushBodySchema = z.looseObject({ records: z.array(z.unknown()) });

/**
 * One issue per violation, across every record — a client fixing a 20-record push should
 * not need one round trip per mistake. zod reports every failing key by default, and only
 * the first failing check per key, which is what keeps a non-numeric `clientUpdatedAt`
 * from being reported as clock drift as well.
 */
function issuesFor(raw: unknown, index: number, nowMs: number): ValidationIssue[] {
  // Anything that is not an object is reported as every field missing, the same as `{}`.
  // Handing zod a primitive yields one issue with an empty path, which would render as the
  // pointer `/records/0/` — naming no field — and carry zod's own message rather than the
  // strings clients parse.
  const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
  const result = recordSchema(nowMs).safeParse(record);
  if (result.success) {
    return [];
  }
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const issue of result.error.issues) {
    const field = issue.path.join('/');
    if (seen.has(field)) {
      continue;
    }
    seen.add(field);
    issues.push({ index, pointer: `/records/${index}/${field}`, detail: issue.message });
  }
  return issues;
}

export function validatePushBody(
  body: unknown,
  nowMs: number
): { records: PushRecord[] } | PushBodyProblem {
  const parsed = pushBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      problemCode: 'invalid_request',
      issues: [{ pointer: '/records', detail: 'body must be an object with a records array' }],
    };
  }
  const records = parsed.data.records;
  if (records.length > MAX_BATCH_SIZE) {
    return {
      problemCode: 'batch_too_large',
      issues: [{ pointer: '/records', detail: `must not exceed ${MAX_BATCH_SIZE} records` }],
    };
  }
  const issues = records.flatMap((raw, index) => issuesFor(raw, index, nowMs));
  if (issues.length > 0) {
    return { problemCode: 'invalid_record', issues };
  }
  return { records: records as PushRecord[] };
}
