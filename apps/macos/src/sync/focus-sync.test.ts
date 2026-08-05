import { describe, expect, it, vi } from 'vitest';
import { startFocusSync } from './focus-sync';

function fakeFocus() {
  let fire: () => void = () => {};
  const subscribe = (cb: () => void) => {
    fire = cb;
    return () => {};
  };
  return { subscribe, focus: () => fire() };
}

describe('startFocusSync', () => {
  it('syncs when the window regains focus', () => {
    const controller = { syncNow: vi.fn(async () => undefined) };
    const source = fakeFocus();

    startFocusSync(controller, { onFocus: source.subscribe, now: () => 0 });
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(1);
  });

  it('does not sync again inside the throttle window', () => {
    const controller = { syncNow: vi.fn(async () => undefined) };
    const source = fakeFocus();
    let clock = 0;

    startFocusSync(controller, { onFocus: source.subscribe, now: () => clock });
    source.focus();
    clock = 29_000;
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(1);
  });

  it('syncs again once the throttle window has passed', () => {
    const controller = { syncNow: vi.fn(async () => undefined) };
    const source = fakeFocus();
    let clock = 0;

    startFocusSync(controller, { onFocus: source.subscribe, now: () => clock });
    source.focus();
    clock = 31_000;
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(2);
  });
});
