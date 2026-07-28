import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from './toast-store';

beforeEach(() => {
  useToastStore.getState().clearAll();
});

describe('toast store', () => {
  // The quote-refresh and reminder-sweep intervals report the same failure on every tick, so
  // without this a persistent storage failure buries the screen in identical copies.
  it('collapses a message that is already on screen', () => {
    useToastStore.getState().error('Failed to refresh quote. Please try again.');
    useToastStore.getState().error('Failed to refresh quote. Please try again.');

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('still shows a different message, and the same text at a different level', () => {
    useToastStore.getState().error('Failed to refresh quote. Please try again.');
    useToastStore.getState().error('Failed to save session. Please try again.');
    useToastStore.getState().warning('Failed to refresh quote. Please try again.');

    expect(useToastStore.getState().toasts).toHaveLength(3);
  });

  it('shows the message again once the earlier one is gone', () => {
    useToastStore.getState().error('Failed to refresh quote. Please try again.');
    const [first] = useToastStore.getState().toasts;
    useToastStore.getState().removeToast(first.id);

    useToastStore.getState().error('Failed to refresh quote. Please try again.');

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
