import { daysBetween } from './date-utils';

export interface NudgeShowState {
  dismissed: boolean;
  count: number;
  lastShownAt: string | null;
}

const REVIEW_STREAK_THRESHOLD = 7;
const REVIEW_POMODORO_THRESHOLD = 10;
export const REVIEW_MAX_SHOWS = 2;
const REVIEW_RESHOW_DAYS = 7;

/**
 * Whether to surface the store-review prompt: a delight milestone reached (7-day
 * streak or 10 pomodoros), past onboarding, not dismissed, shown < 2 times, and
 * the second ask spaced a week after the first. Pure so the trigger is
 * unit-testable. `today` and `state.lastShownAt` are `yyyy-MM-dd` day strings.
 */
export function shouldShowReviewPrompt(params: {
  streakCurrent: number;
  completedPomodoros: number;
  hasSeenOnboarding: boolean;
  state: NudgeShowState;
  today: string;
}): boolean {
  const { streakCurrent, completedPomodoros, hasSeenOnboarding, state, today } = params;

  if (state.dismissed || !hasSeenOnboarding || state.count >= REVIEW_MAX_SHOWS) {
    return false;
  }

  const reachedMilestone =
    streakCurrent >= REVIEW_STREAK_THRESHOLD || completedPomodoros >= REVIEW_POMODORO_THRESHOLD;
  if (!reachedMilestone) {
    return false;
  }

  // The second ask waits at least a week after the first. daysBetween returns NaN
  // for a missing/malformed lastShownAt; the negated comparison keeps it hidden.
  if (state.count >= 1) {
    if (!state.lastShownAt) {
      return false;
    }
    if (!(daysBetween(state.lastShownAt, today) >= REVIEW_RESHOW_DAYS)) {
      return false;
    }
  }

  return true;
}
