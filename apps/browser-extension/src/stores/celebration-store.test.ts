import { beforeEach, describe, expect, it } from 'vitest';
import { useCelebrationStore } from './celebration-store';

describe('Celebration Store', () => {
  beforeEach(() => {
    useCelebrationStore.setState({ active: null });
  });

  it('sets active when celebrate is called', () => {
    useCelebrationStore.getState().celebrate('pomodoro');
    expect(useCelebrationStore.getState().active).toBe('pomodoro');
  });

  it('ignores a second celebrate while one is active (debounce)', () => {
    useCelebrationStore.getState().celebrate('pomodoro');
    useCelebrationStore.getState().celebrate('allGoals');
    expect(useCelebrationStore.getState().active).toBe('pomodoro');
  });

  it('clears active on dismiss', () => {
    useCelebrationStore.getState().celebrate('allGoals');
    useCelebrationStore.getState().dismiss();
    expect(useCelebrationStore.getState().active).toBe(null);
  });
});
