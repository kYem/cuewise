import type { SyncUiStatus } from '@cuewise/app';
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

function fakeController(status: SyncUiStatus = 'active') {
  return { getStatus: () => status, syncNow: vi.fn(async () => undefined) };
}

describe('startFocusSync', () => {
  it('syncs when the window regains focus', () => {
    const controller = fakeController();
    const source = fakeFocus();

    startFocusSync(controller, { onFocus: source.subscribe, now: () => 0 });
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(1);
  });

  it('does not sync again inside the throttle window', () => {
    const controller = fakeController();
    const source = fakeFocus();
    let clock = 0;

    startFocusSync(controller, { onFocus: source.subscribe, now: () => clock });
    source.focus();
    clock = 29_000;
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(1);
  });

  // Every activation would otherwise flicker the pill off → syncing → off on a device that never
  // enabled sync, and an OAuth return is the likeliest focus event of all.
  it('does not sync while sync is off', () => {
    const controller = fakeController('off');
    const source = fakeFocus();

    startFocusSync(controller, { onFocus: source.subscribe, now: () => 0 });
    source.focus();

    expect(controller.syncNow).not.toHaveBeenCalled();
  });

  // A skipped activation must not spend the throttle window either, or the activation that
  // enabling sync produces is the one that gets swallowed.
  it('does not consume the throttle window while sync is off', () => {
    let status: SyncUiStatus = 'off';
    let clock = 0;
    const controller = { getStatus: () => status, syncNow: vi.fn(async () => undefined) };
    const source = fakeFocus();

    startFocusSync(controller, { onFocus: source.subscribe, now: () => clock });
    source.focus();
    expect(controller.syncNow).not.toHaveBeenCalled();

    status = 'active';
    clock = 1_000;
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(1);
  });

  it('syncs again once the throttle window has passed', () => {
    const controller = fakeController();
    const source = fakeFocus();
    let clock = 0;

    startFocusSync(controller, { onFocus: source.subscribe, now: () => clock });
    source.focus();
    clock = 31_000;
    source.focus();

    expect(controller.syncNow).toHaveBeenCalledTimes(2);
  });
});
