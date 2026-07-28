import { logger } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './toast-store';

const REPEATING = 'Failed to refresh quote. Please try again.';

beforeEach(() => {
  useToastStore.getState().clearAll();
  vi.restoreAllMocks();
});

describe('toast store', () => {
  // The quote-refresh interval reports the same failure on every tick, so without this a
  // persistent storage failure buries the screen in identical copies.
  it('collapses a repeat the caller asked to collapse', () => {
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  // Two reminders can legitimately carry the same text in one sweep, and `notified` is already
  // persisted by then — a dropped toast is a notification the user never sees at all.
  it('shows an identical message twice when the caller did not opt in', () => {
    useToastStore.getState().warning('Reminder: stretch');
    useToastStore.getState().warning('Reminder: stretch');

    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('still shows a different message, and the same text at a different level', () => {
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });
    useToastStore.getState().error('Failed to save session. Please try again.');
    useToastStore.getState().warning(REPEATING, { collapseRepeats: true });

    expect(useToastStore.getState().toasts).toHaveLength(3);
  });

  it('shows the message again once the earlier one is gone', () => {
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });
    const [first] = useToastStore.getState().toasts;
    useToastStore.getState().removeToast(first.id);

    useToastStore.getState().error(REPEATING, { collapseRepeats: true });

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  // A retry that failed again must not look like one that worked: the toast has to restart
  // rather than fade on the first attempt's clock.
  it('restarts the auto-dismiss of the toast it collapsed into', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });
    const [first] = useToastStore.getState().toasts;
    expect(first.repeatedAt).toBeUndefined();

    vi.spyOn(Date, 'now').mockReturnValue(4000);
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });

    const [collapsed] = useToastStore.getState().toasts;
    expect(collapsed.id).toBe(first.id);
    expect(collapsed.repeatedAt).toBe(4000);
  });

  it('logs the repeat it kept off the screen', () => {
    const logged = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });
    useToastStore.getState().error(REPEATING, { collapseRepeats: true });

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('Collapsed'),
      expect.objectContaining({ type: 'error', message: REPEATING })
    );
  });
});
