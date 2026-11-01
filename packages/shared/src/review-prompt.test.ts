import { describe, expect, it } from 'vitest';
import { shouldShowReviewPrompt } from './review-prompt';

describe('shouldShowReviewPrompt', () => {
  const base = {
    streakCurrent: 0,
    completedPomodoros: 0,
    hasSeenOnboarding: true,
    state: { dismissed: false, count: 0, lastShownAt: null as string | null },
    today: '2026-06-11',
  };

  it('shows once a delight milestone is reached (7-day streak)', () => {
    expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7 })).toBe(true);
  });

  it('shows once 10 pomodoros are completed', () => {
    expect(shouldShowReviewPrompt({ ...base, completedPomodoros: 10 })).toBe(true);
  });

  it('does not show below either threshold', () => {
    expect(shouldShowReviewPrompt({ ...base, streakCurrent: 6, completedPomodoros: 9 })).toBe(
      false
    );
  });

  it('does not show before onboarding is complete', () => {
    expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7, hasSeenOnboarding: false })).toBe(
      false
    );
  });

  it('does not show once permanently dismissed', () => {
    expect(
      shouldShowReviewPrompt({
        ...base,
        streakCurrent: 7,
        state: { ...base.state, dismissed: true },
      })
    ).toBe(false);
  });

  it('does not show after it has been shown twice', () => {
    expect(
      shouldShowReviewPrompt({
        ...base,
        streakCurrent: 7,
        state: { dismissed: false, count: 2, lastShownAt: '2026-06-01' },
      })
    ).toBe(false);
  });

  it('spaces the second ask at least 7 days after the first', () => {
    const seen = { dismissed: false, count: 1 };
    // 6 days later — too soon
    expect(
      shouldShowReviewPrompt({
        ...base,
        streakCurrent: 7,
        state: { ...seen, lastShownAt: '2026-06-05' },
      })
    ).toBe(false);
    // 7 days later — eligible again
    expect(
      shouldShowReviewPrompt({
        ...base,
        streakCurrent: 7,
        state: { ...seen, lastShownAt: '2026-06-04' },
      })
    ).toBe(true);
  });

  it('shows on the first eligible milestone (count 0, no lastShownAt)', () => {
    expect(shouldShowReviewPrompt({ ...base, completedPomodoros: 10 })).toBe(true);
  });

  it('shows when both signals are met', () => {
    expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7, completedPomodoros: 10 })).toBe(
      true
    );
  });

  it('stays hidden when a prior show has no/invalid lastShownAt', () => {
    const seen = { dismissed: false, count: 1 };
    expect(
      shouldShowReviewPrompt({ ...base, streakCurrent: 7, state: { ...seen, lastShownAt: null } })
    ).toBe(false);
    expect(
      shouldShowReviewPrompt({
        ...base,
        streakCurrent: 7,
        state: { ...seen, lastShownAt: 'not-a-date' },
      })
    ).toBe(false);
  });
});
