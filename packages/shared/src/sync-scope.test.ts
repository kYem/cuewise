import { describe, expect, it } from 'vitest';
import { DEVICE_LOCAL_SETTINGS_KEYS } from './sync-scope';

describe('DEVICE_LOCAL_SETTINGS_KEYS', () => {
  it('contains exactly the five keys that must never sync', () => {
    expect(DEVICE_LOCAL_SETTINGS_KEYS).toEqual([
      'syncEnabled',
      'cloudSyncEnabled',
      'logLevel',
      'focusedGoalId',
      'hasSeenOnboarding',
    ]);
  });
});
