import { type Goal, getTodayDateString, type PomodoroSession, REVIEW_URL } from '@cuewise/shared';
import { goalFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReviewPrompt } from './useReviewPrompt';

const workSession = (overrides: Partial<PomodoroSession> = {}): PomodoroSession => ({
  id: 'session',
  startedAt: '2026-01-01T09:00:00.000Z',
  interrupted: false,
  duration: 25,
  type: 'work',
  ...overrides,
});

const tenWorkSessions = Array.from({ length: 10 }, (_, i) => workSession({ id: `w${i}` }));

// Local yyyy-MM-dd, matching getTodayDateString so calculateStreak aligns by day.
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface HarnessProps {
  sessions?: PomodoroSession[];
  goals?: Goal[];
  ready?: boolean;
  pomodoroIdle?: boolean;
  hasSeenOnboarding?: boolean;
  updateSpy: (patch: Record<string, unknown>) => void;
}

// Models the settings store: updateSettings updates local state, which feeds
// back into the hook params — exactly how the real store re-renders NewTabPage.
function Harness({
  sessions = [],
  goals = [],
  ready = true,
  pomodoroIdle = true,
  hasSeenOnboarding = true,
  updateSpy,
}: HarnessProps) {
  const [state, setState] = useState({
    dismissed: false,
    count: 0,
    lastShownAt: null as string | null,
  });
  const updateSettings = (patch: {
    reviewPromptDismissed?: boolean;
    reviewPromptCount?: number;
    reviewPromptLastShownAt?: string | null;
  }) => {
    updateSpy(patch);
    // Mirror the real store's plain spread-merge: a key present in the patch
    // overwrites (including an explicit null), absent keys keep their value.
    setState((cur) => ({
      dismissed:
        patch.reviewPromptDismissed === undefined ? cur.dismissed : patch.reviewPromptDismissed,
      count: patch.reviewPromptCount === undefined ? cur.count : patch.reviewPromptCount,
      lastShownAt:
        patch.reviewPromptLastShownAt === undefined
          ? cur.lastShownAt
          : patch.reviewPromptLastShownAt,
    }));
  };
  const rp = useReviewPrompt({
    ready,
    pomodoroIdle,
    hasSeenOnboarding,
    goals,
    sessions,
    dismissed: state.dismissed,
    count: state.count,
    lastShownAt: state.lastShownAt,
    updateSettings,
  });

  return (
    <div>
      <span data-testid="open">{String(rp.isOpen)}</span>
      <button type="button" onClick={rp.onReview}>
        review
      </button>
      <button type="button" onClick={rp.onLater}>
        later
      </button>
      <button type="button" onClick={rp.onDismiss}>
        dismiss
      </button>
    </div>
  );
}

const isOpen = () => screen.getByTestId('open').textContent === 'true';

describe('useReviewPrompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens and records the show when 10 pomodoros are completed', () => {
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} updateSpy={updateSpy} />);

    expect(isOpen()).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({
      reviewPromptCount: 1,
      reviewPromptLastShownAt: getTodayDateString(),
    });
  });

  it('opens on a 7-day completed-goal streak', () => {
    const goals = Array.from({ length: 7 }, (_, i) =>
      goalFactory.build({ completed: true, date: daysAgo(i) })
    );
    render(<Harness goals={goals} updateSpy={vi.fn()} />);

    expect(isOpen()).toBe(true);
  });

  it('does not count interrupted or break sessions toward the pomodoro signal', () => {
    const updateSpy = vi.fn();
    const sessions = [
      ...Array.from({ length: 9 }, (_, i) => workSession({ id: `w${i}` })),
      workSession({ id: 'int', interrupted: true }),
      workSession({ id: 'brk', type: 'break' }),
    ];
    render(<Harness sessions={sessions} updateSpy={updateSpy} />);

    expect(isOpen()).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('does not interrupt a running pomodoro', () => {
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} pomodoroIdle={false} updateSpy={updateSpy} />);

    expect(isOpen()).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('opens once the pomodoro returns to idle', () => {
    const updateSpy = vi.fn();
    const { rerender } = render(
      <Harness sessions={tenWorkSessions} pomodoroIdle={false} updateSpy={updateSpy} />
    );
    expect(isOpen()).toBe(false);

    rerender(<Harness sessions={tenWorkSessions} pomodoroIdle={true} updateSpy={updateSpy} />);

    expect(isOpen()).toBe(true);
  });

  it('does not run before settings are ready', () => {
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} ready={false} updateSpy={updateSpy} />);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('opens the store and stops asking on review', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} updateSpy={updateSpy} />);

    await user.click(screen.getByRole('button', { name: 'review' }));

    expect(open).toHaveBeenCalledWith(REVIEW_URL, '_blank', 'noopener,noreferrer');
    expect(updateSpy).toHaveBeenCalledWith({ reviewPromptDismissed: true });
    expect(isOpen()).toBe(false);
  });

  it('does not permanently dismiss when the review popup is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'open').mockReturnValue(null);
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} updateSpy={updateSpy} />);

    await user.click(screen.getByRole('button', { name: 'review' }));

    expect(updateSpy).not.toHaveBeenCalledWith({ reviewPromptDismissed: true });
    expect(isOpen()).toBe(false);
  });

  it('stops asking permanently on dismiss and does not re-open', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} updateSpy={updateSpy} />);

    await user.click(screen.getByRole('button', { name: 'dismiss' }));

    expect(updateSpy).toHaveBeenCalledWith({ reviewPromptDismissed: true });
    expect(isOpen()).toBe(false);
  });

  it('does not re-open after "later" (the show was already counted)', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.fn();
    render(<Harness sessions={tenWorkSessions} updateSpy={updateSpy} />);

    await user.click(screen.getByRole('button', { name: 'later' }));

    // Only the count write from opening; "later" itself writes nothing and the
    // spaced-out gate keeps it from re-opening the same day.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);
  });
});
