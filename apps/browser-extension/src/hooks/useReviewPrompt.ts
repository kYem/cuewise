import {
  calculateStreak,
  type Goal,
  getTodayDateString,
  type PomodoroSession,
  REVIEW_URL,
  type Settings,
  shouldShowReviewPrompt,
} from '@cuewise/shared';
import { useEffect, useState } from 'react';

type ReviewSettingsPatch = Partial<
  Pick<Settings, 'reviewPromptCount' | 'reviewPromptLastShownAt' | 'reviewPromptDismissed'>
>;

interface UseReviewPromptParams {
  ready: boolean; // settings have loaded
  pomodoroIdle: boolean; // don't interrupt a running timer
  hasSeenOnboarding: boolean;
  goals: Goal[];
  sessions: PomodoroSession[];
  dismissed: boolean;
  count: number;
  lastShownAt: string | null;
  updateSettings: (patch: ReviewSettingsPatch) => void;
}

export interface UseReviewPromptResult {
  isOpen: boolean;
  onReview: () => void;
  onLater: () => void;
  onDismiss: () => void;
}

/**
 * Drives the store-review prompt: evaluates eligibility at a calm tab-open
 * moment and owns the show-count + dismissal writes. Counting the show on open
 * is what caps it to at most twice (see shouldShowReviewPrompt).
 */
export function useReviewPrompt({
  ready,
  pomodoroIdle,
  hasSeenOnboarding,
  goals,
  sessions,
  dismissed,
  count,
  lastShownAt,
  updateSettings,
}: UseReviewPromptParams): UseReviewPromptResult {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!ready || isOpen || !pomodoroIdle) {
      return;
    }
    const streakCurrent = calculateStreak(
      goals.filter((g) => g.completed).map((g) => g.date)
    ).current;
    const completedPomodoros = sessions.filter((s) => s.type === 'work' && !s.interrupted).length;
    const eligible = shouldShowReviewPrompt({
      streakCurrent,
      completedPomodoros,
      hasSeenOnboarding,
      state: { dismissed, count, lastShownAt },
      today: getTodayDateString(),
    });
    if (eligible) {
      setIsOpen(true);
      updateSettings({
        reviewPromptCount: count + 1,
        reviewPromptLastShownAt: getTodayDateString(),
      });
    }
  }, [
    ready,
    isOpen,
    pomodoroIdle,
    hasSeenOnboarding,
    goals,
    sessions,
    dismissed,
    count,
    lastShownAt,
    updateSettings,
  ]);

  const onReview = () => {
    window.open(REVIEW_URL, '_blank', 'noopener,noreferrer');
    updateSettings({ reviewPromptDismissed: true });
    setIsOpen(false);
  };

  const onLater = () => {
    setIsOpen(false);
  };

  const onDismiss = () => {
    updateSettings({ reviewPromptDismissed: true });
    setIsOpen(false);
  };

  return { isOpen, onReview, onLater, onDismiss };
}
