import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptNudge } from './useConceptNudge';

interface Params {
  ready: boolean;
  enabled: boolean;
  conceptCount: number;
  totalQuoteViews: number;
  dismissed: boolean;
  count: number;
  lastShownAt: string | null;
  updateSettings: ReturnType<typeof vi.fn>;
}

function baseParams(overrides: Partial<Params> = {}): Params {
  return {
    ready: true,
    enabled: true,
    conceptCount: 0,
    totalQuoteViews: 150,
    dismissed: false,
    count: 0,
    lastShownAt: null,
    updateSettings: vi.fn(),
    ...overrides,
  };
}

describe('useConceptNudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays hidden until settings are ready', () => {
    const props = baseParams({ ready: false });
    const { result } = renderHook((p: Params) => useConceptNudge(p), { initialProps: props });

    expect(result.current.isVisible).toBe(false);
    expect(props.updateSettings).not.toHaveBeenCalled();
  });

  it('shows once for an eligible user and records the show', () => {
    const props = baseParams();
    const { result } = renderHook((p: Params) => useConceptNudge(p), { initialProps: props });

    expect(result.current.isVisible).toBe(true);
    expect(props.updateSettings).toHaveBeenCalledTimes(1);
    expect(props.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ conceptNudgeCount: 1 })
    );
  });

  it('retracts once the user adds a card', () => {
    const props = baseParams();
    const { result, rerender } = renderHook((p: Params) => useConceptNudge(p), {
      initialProps: props,
    });
    expect(result.current.isVisible).toBe(true);

    rerender(baseParams({ updateSettings: props.updateSettings, conceptCount: 1 }));

    expect(result.current.isVisible).toBe(false);
  });

  it('dismisses permanently on dismiss', () => {
    const props = baseParams();
    const { result, rerender } = renderHook((p: Params) => useConceptNudge(p), {
      initialProps: props,
    });

    act(() => {
      result.current.onDismiss();
    });

    expect(props.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ conceptNudgeDismissed: true })
    );

    // Once the dismissal is persisted, it stays hidden and never re-shows.
    rerender(baseParams({ updateSettings: props.updateSettings, dismissed: true }));
    expect(result.current.isVisible).toBe(false);
  });
});
