import { describe, expect, it } from 'vitest';
import { record } from './__fixtures__/api-test-helpers.fixtures';
import { MAX_CLOCK_DRIFT_MS, validatePushBody } from './validate-changes';

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

  it('does not double-report a non-number clientUpdatedAt as drift', () => {
    const result = validatePushBody({ records: [record({ clientUpdatedAt: Number.NaN })] }, NOW);
    if (!('problemCode' in result)) {
      throw new Error('expected a problem result');
    }
    expect(result.issues).toEqual([
      { index: 0, pointer: '/records/0/clientUpdatedAt', detail: 'required finite number' },
    ]);
  });
});
