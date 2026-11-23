import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRemote } from '../public/scripts/demo-remote.js';
import {
  bodylessWindowWithFocusDialogClosingOnItsOwn,
  documentMidNavigation,
  fakeAppWindow,
  throwingWindow,
} from './__fixtures__/demo-remote.fixtures';
import { fakeStorage } from './__fixtures__/storage.fixtures';

describe('createDemoRemote', () => {
  describe('when a step throws', () => {
    it('resolves false for an unknown step', async () => {
      const remote = createDemoRemote(throwingWindow(), fakeStorage());
      await expect(remote.go('nope')).resolves.toBe(false);
    });

    it('resolves false', async () => {
      const remote = createDemoRemote(throwingWindow(), fakeStorage());
      await expect(remote.go('today')).resolves.toBe(false);
    });

    it('still settles a later call', async () => {
      const remote = createDemoRemote(throwingWindow(), fakeStorage());
      await expect(remote.go('today')).resolves.toBe(false);
      await expect(remote.go('pomodoro')).resolves.toBe(false);
    });
  });

  describe('while the document is mid-navigation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reads a missing documentElement as no theme and asks for one', async () => {
      const storage = fakeStorage();
      const result = createDemoRemote(documentMidNavigation(), storage).go('themes');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(false);
      expect(storage.getItem('settings.colorTheme')).toBe('"purple"');
    });

    it('presses a key on a missing body as a no-op', async () => {
      const remote = createDemoRemote(
        bodylessWindowWithFocusDialogClosingOnItsOwn(),
        fakeStorage()
      );
      const result = remote.go('today');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
    });
  });

  describe('moving between pages', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('replaces the history entry and fires hashchange instead of assigning the hash', async () => {
      const { win, events } = fakeAppWindow(fakeStorage());
      const result = createDemoRemote(win, fakeStorage()).go('pomodoro');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
      expect(events).toEqual(['replaceState http://localhost/demo/#pomodoro', 'hashchange']);
    });

    it('does not navigate when it is already on the page', async () => {
      const { win, events } = fakeAppWindow(fakeStorage(), 'pomodoro');
      const result = createDemoRemote(win, fakeStorage()).go('pomodoro');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
      expect(events).toEqual([]);
    });

    it('goes home before it changes the theme', async () => {
      const storage = fakeStorage();
      const { win, events } = fakeAppWindow(storage, 'insights');
      const result = createDemoRemote(win, storage).go('themes');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
      expect(events).toEqual(['replaceState http://localhost/demo/', 'hashchange', 'reload']);
    });
  });
});
