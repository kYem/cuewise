import { describe, expect, it } from 'vitest';
import { assertPersisted, storageFailure, storageWriteErrorMessage } from './storage-result';

const FALLBACK = 'Failed to save. Please try again.';
const FULL = 'Storage is full. Free up some space to continue.';

describe('storageWriteErrorMessage', () => {
  // The collection writers pass the StorageError itself; the rest pass what assertPersisted threw.
  it.each([
    ['quota_exceeded' as const],
    ['per_item_quota_exceeded' as const],
  ])('answers the quota copy for a raw %s error', (type) => {
    expect(storageWriteErrorMessage({ type, message: 'full' }, FALLBACK)).toBe(FULL);
  });

  it('answers the quota copy through the cause assertPersisted attaches', () => {
    const thrown = new Error('boom', { cause: { type: 'quota_exceeded', message: 'full' } });

    expect(storageWriteErrorMessage(thrown, FALLBACK)).toBe(FULL);
  });

  it.each([
    ['an unknown storage error', { type: 'unknown' as const, message: 'nope' }],
    ['an Error with no cause', new Error('boom')],
    ['a non-Error throw', 'boom'],
    ['nothing at all', undefined],
  ])('keeps the caller copy for %s', (_label, error) => {
    expect(storageWriteErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });
});

describe('assertPersisted', () => {
  it('carries the StorageError as cause so the caller can classify it', () => {
    const result = { success: false, error: { type: 'quota_exceeded' as const, message: 'full' } };

    expect(() => assertPersisted(result)).toThrowError(
      expect.objectContaining({ cause: result.error })
    );
  });

  // Not just any throw: reading `.error.message` off nothing raises a TypeError, which reads
  // as a bug rather than as the write not landing.
  it('throws a described error when the result is missing entirely', () => {
    expect(() => assertPersisted(undefined as never)).toThrowError('The write reported no result');
  });

  it('accepts a successful write', () => {
    expect(() => assertPersisted({ success: true })).not.toThrow();
  });

  it('rejects the failure storageFailure builds', () => {
    expect(() => assertPersisted(storageFailure('nope'))).toThrow('nope');
  });
});
