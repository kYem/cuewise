import { requireNonEmptyString, type ValidationIssue } from './problem-details';
import type { PushRecord } from './store';

export const MAX_BATCH_SIZE = 100;
export const MAX_CIPHERTEXT_BYTES = 65536;
export const MAX_COLLECTION_LENGTH = 64;
export const MAX_ENTITY_ID_LENGTH = 128;

type PushBodyProblem = {
  problemCode: 'invalid_request' | 'batch_too_large' | 'invalid_record';
  issues: ValidationIssue[];
};

const encoder = new TextEncoder();

function validateRecord(raw: unknown, index: number, issues: ValidationIssue[]): void {
  const r = (raw ?? {}) as Record<string, unknown>;
  requireNonEmptyString(
    r.collection,
    `/records/${index}/collection`,
    issues,
    MAX_COLLECTION_LENGTH,
    index
  );
  requireNonEmptyString(
    r.entityId,
    `/records/${index}/entityId`,
    issues,
    MAX_ENTITY_ID_LENGTH,
    index
  );
  if (typeof r.ciphertext !== 'string') {
    issues.push({ index, pointer: `/records/${index}/ciphertext`, detail: 'required string' });
  } else if (encoder.encode(r.ciphertext).length > MAX_CIPHERTEXT_BYTES) {
    issues.push({
      index,
      pointer: `/records/${index}/ciphertext`,
      detail: `must not exceed ${MAX_CIPHERTEXT_BYTES} bytes`,
    });
  }
  if (typeof r.clientUpdatedAt !== 'number' || !Number.isFinite(r.clientUpdatedAt)) {
    issues.push({
      index,
      pointer: `/records/${index}/clientUpdatedAt`,
      detail: 'required finite number',
    });
  }
  if (typeof r.deleted !== 'boolean') {
    issues.push({ index, pointer: `/records/${index}/deleted`, detail: 'required boolean' });
  }
}

export function validatePushBody(body: unknown): { records: PushRecord[] } | PushBodyProblem {
  if (body === null || typeof body !== 'object') {
    return {
      problemCode: 'invalid_request',
      issues: [{ pointer: '/records', detail: 'body must be an object with a records array' }],
    };
  }
  const records = (body as Record<string, unknown>).records;
  if (!Array.isArray(records)) {
    return {
      problemCode: 'invalid_request',
      issues: [{ pointer: '/records', detail: 'body must be an object with a records array' }],
    };
  }
  if (records.length > MAX_BATCH_SIZE) {
    return {
      problemCode: 'batch_too_large',
      issues: [{ pointer: '/records', detail: `must not exceed ${MAX_BATCH_SIZE} records` }],
    };
  }
  const issues: ValidationIssue[] = [];
  records.forEach((raw, index) => {
    validateRecord(raw, index, issues);
  });
  if (issues.length > 0) {
    return { problemCode: 'invalid_record', issues };
  }
  return { records: records as PushRecord[] };
}
