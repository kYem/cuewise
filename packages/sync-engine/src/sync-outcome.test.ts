import { ApiError } from '@cuewise/sync-client';
import { describe, expect, it } from 'vitest';
import { classifySyncFailure } from './sync-outcome';

describe('classifySyncFailure', () => {
  it('reads an exhausted-retry network error as network', () => {
    expect(classifySyncFailure(new ApiError('network_error', 0))).toBe('network');
  });

  it('reads any other api error as server', () => {
    expect(classifySyncFailure(new ApiError('internal', 500))).toBe('server');
    expect(classifySyncFailure(new ApiError('bad_request', 400))).toBe('server');
  });

  it('reads anything it does not recognise as device', () => {
    expect(classifySyncFailure(new Error('Could not determine the storage area'))).toBe('device');
    expect(classifySyncFailure('a bare string')).toBe('device');
    expect(classifySyncFailure(undefined)).toBe('device');
  });
});
