import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './constants';

describe('DEFAULT_SETTINGS', () => {
  it('enables celebrations by default', () => {
    expect(DEFAULT_SETTINGS.celebrationsEnabled).toBe(true);
  });

  it('defaults the reminders panel to the composed layout', () => {
    expect(DEFAULT_SETTINGS.reminderPanelLayout).toBe('composed');
  });
});
