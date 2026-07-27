import { describe, expect, it } from 'vitest';
import { record } from './__fixtures__/api-test-helpers.fixtures';
import {
  MAX_BATCH_SIZE,
  MAX_CIPHERTEXT_BYTES,
  MAX_CLOCK_DRIFT_MS,
  MAX_COLLECTION_LENGTH,
  MAX_ENTITY_ID_LENGTH,
  validatePushBody,
} from './validate-changes';

const NOW = 1_800_000_000_000;

describe('validatePushBody clock drift clamp', () => {
  it('rejects a record whose clientUpdatedAt is more than 24h in the future', () => {
    const result = validatePushBody(
      { records: [record({ clientUpdatedAt: NOW + MAX_CLOCK_DRIFT_MS + 3_600_000 })] },
      NOW
    );
    if (!('problemCode' in result)) {
      throw new Error('expected a problem result');
    }
    expect(result.problemCode).toBe('invalid_record');
    expect(result.issues).toEqual([
      { index: 0, pointer: '/records/0/clientUpdatedAt', detail: 'client clock drift too large' },
    ]);
  });

  it('rejects a record whose clientUpdatedAt is more than 24h in the past', () => {
    const result = validatePushBody(
      { records: [record({ clientUpdatedAt: NOW - MAX_CLOCK_DRIFT_MS - 3_600_000 })] },
      NOW
    );
    if (!('problemCode' in result)) {
      throw new Error('expected a problem result');
    }
    expect(result.problemCode).toBe('invalid_record');
    expect(result.issues).toEqual([
      { index: 0, pointer: '/records/0/clientUpdatedAt', detail: 'client clock drift too large' },
    ]);
  });

  it('accepts a record within 24h in the past', () => {
    const result = validatePushBody(
      { records: [record({ clientUpdatedAt: NOW - 3_600_000 })] },
      NOW
    );
    expect('records' in result).toBe(true);
  });

  it('accepts a record within 24h in the future', () => {
    const result = validatePushBody(
      { records: [record({ clientUpdatedAt: NOW + 3_600_000 })] },
      NOW
    );
    expect('records' in result).toBe(true);
  });

  it('accepts a record exactly at the 24h boundary', () => {
    const result = validatePushBody(
      { records: [record({ clientUpdatedAt: NOW - MAX_CLOCK_DRIFT_MS })] },
      NOW
    );
    expect('records' in result).toBe(true);
  });

  // Pins the message choice, not a dedupe: zod aborts a key after its first failing
  // check, so drift is never evaluated for a value that is not a finite number.
  it('reports a non-number clientUpdatedAt as a type fault, never as clock drift', () => {
    const result = validatePushBody({ records: [record({ clientUpdatedAt: Number.NaN })] }, NOW);
    if (!('problemCode' in result)) {
      throw new Error('expected a problem result');
    }
    expect(result.issues).toEqual([
      { index: 0, pointer: '/records/0/clientUpdatedAt', detail: 'required finite number' },
    ]);
  });
});

// Characterization of the published error contract, written against the hand-rolled
// implementation so a port to schemas is provably behaviour-preserving. Every pointer and
// detail string below is part of what a client parses out of problem+json `errors[]`;
// changing one is an API change, not a refactor.
describe('the push validation error contract', () => {
  /** The shared fixture stamps wall-clock time, which reads as drift against a fixed NOW. */
  function at(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...record({ clientUpdatedAt: NOW }), ...overrides };
  }

  function problemFor(body: unknown): { problemCode: string; issues: unknown[] } {
    const result = validatePushBody(body, NOW);
    if (!('problemCode' in result)) {
      throw new Error('expected a problem result');
    }
    return result;
  }

  it.each([
    ['a null body', null],
    ['a non-object body', 'nope'],
    ['a body with no records key', {}],
    ['a records value that is not an array', { records: 'nope' }],
  ])('reports %s as an unparseable request, not a bad record', (_label, body) => {
    expect(problemFor(body)).toEqual({
      problemCode: 'invalid_request',
      issues: [{ pointer: '/records', detail: 'body must be an object with a records array' }],
    });
  });

  it('reports an over-sized batch with its own code and no per-record noise', () => {
    const tooMany = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => at());

    expect(problemFor({ records: tooMany })).toEqual({
      problemCode: 'batch_too_large',
      issues: [{ pointer: '/records', detail: `must not exceed ${MAX_BATCH_SIZE} records` }],
    });
  });

  it.each([
    ['collection', 'required non-empty string'],
    ['entityId', 'required non-empty string'],
    ['ciphertext', 'required string'],
    ['clientUpdatedAt', 'required finite number'],
    ['deleted', 'required boolean'],
  ])('names %s with the exact detail a client parses', (field, detail) => {
    const broken = at();
    delete broken[field];

    expect(problemFor({ records: [broken] }).issues).toEqual([
      { index: 0, pointer: `/records/0/${field}`, detail },
    ]);
  });

  it.each([
    ['collection', 'a'.repeat(MAX_COLLECTION_LENGTH + 1), 'must not exceed 64 bytes'],
    ['entityId', 'a'.repeat(MAX_ENTITY_ID_LENGTH + 1), 'must not exceed 128 bytes'],
    ['ciphertext', 'a'.repeat(MAX_CIPHERTEXT_BYTES + 1), 'must not exceed 65536 bytes'],
  ])('reports %s over its cap by byte length', (field, value, detail) => {
    const broken = at({ [field]: value });

    expect(problemFor({ records: [broken] }).issues).toEqual([
      { index: 0, pointer: `/records/0/${field}`, detail },
    ]);
  });

  // A client fixing a 20-record push should not need one round trip per mistake.
  it('accumulates every violation across every record rather than stopping at the first', () => {
    const first = at({ collection: '', deleted: 'nope' });
    const second = at({ entityId: 42 });

    const issues = problemFor({ records: [first, second] }).issues;

    expect(issues).toEqual([
      { index: 0, pointer: '/records/0/collection', detail: 'required non-empty string' },
      { index: 0, pointer: '/records/0/deleted', detail: 'required boolean' },
      { index: 1, pointer: '/records/1/entityId', detail: 'required non-empty string' },
    ]);
  });

  it('carries the record index on every per-record issue, and none on a body-level one', () => {
    expect(
      problemFor({ records: [at({ collection: '' })] }).issues.every(
        (i) => 'index' in (i as object)
      )
    ).toBe(true);
    expect(problemFor(null).issues.every((i) => 'index' in (i as object))).toBe(false);
  });

  it('measures the caps in bytes, so a multi-byte string cannot slip past a length check', () => {
    // 20 emoji: 40 UTF-16 code units, so a naive `value.length` check would pass it, but
    // 80 bytes, so the byte cap must not. A longer string would fail both and prove nothing.
    const broken = at({ collection: '🙂'.repeat(20) });

    expect(problemFor({ records: [broken] }).issues).toEqual([
      { index: 0, pointer: '/records/0/collection', detail: 'must not exceed 64 bytes' },
    ]);
  });

  // A client with a serialization bug sends a primitive where a record belongs. Handing
  // that straight to the object schema yields one issue with an empty path, which renders
  // as the pointer `/records/0/` — naming no field — with zod's own message attached.
  it.each([
    ['a primitive', 42],
    ['a string', 'nope'],
    ['an array', []],
  ])('reports %s in the records list as every field missing', (_label, element) => {
    const issues = problemFor({ records: [element] }).issues;

    expect(issues).toEqual([
      { index: 0, pointer: '/records/0/collection', detail: 'required non-empty string' },
      { index: 0, pointer: '/records/0/entityId', detail: 'required non-empty string' },
      { index: 0, pointer: '/records/0/ciphertext', detail: 'required string' },
      { index: 0, pointer: '/records/0/clientUpdatedAt', detail: 'required finite number' },
      { index: 0, pointer: '/records/0/deleted', detail: 'required boolean' },
    ]);
  });
});
