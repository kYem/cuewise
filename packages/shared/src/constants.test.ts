import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './constants';

describe('DEFAULT_SETTINGS', () => {
  it('enables celebrations by default', () => {
    expect(DEFAULT_SETTINGS.celebrationsEnabled).toBe(true);
  });
});
