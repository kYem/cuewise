import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRemote, PHOTO_WAIT_MS } from '../public/scripts/demo-remote.js';
import {
  bodylessWindowWithFocusDialogClosingOnItsOwn,
  documentMidNavigation,
  fakeAppWindow,
  seededStorage,
  throwingWindow,
  trackSettled,
} from './__fixtures__/demo-remote.fixtures';
import { fakeStorage } from './__fixtures__/storage.fixtures';

describe('createDemoRemote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

    it('warns with the step and the error', async () => {
      const remote = createDemoRemote(throwingWindow(), fakeStorage());
      await remote.go('today');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringMatching(/^Cuewise demo: .*"today"/),
        expect.objectContaining({ message: 'document is gone' })
      );
    });
  });

  describe('while the document is mid-navigation', () => {
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

  describe('waiting for the glass photo', () => {
    it('holds a glass step until the photo layer is opaque', async () => {
      const { win, showPhoto } = fakeAppWindow(fakeStorage(), '', 'fading');
      const result = createDemoRemote(win, fakeStorage()).go('today');
      const step = trackSettled(result);

      await vi.advanceTimersByTimeAsync(2000);
      expect(step.settled).toBe(false);
      showPhoto();
      await vi.advanceTimersByTimeAsync(200);

      expect(step.settled).toBe(true);
      await expect(result).resolves.toBe(true);
    });

    it('resolves true after the cap when the photo never shows', async () => {
      const { win } = fakeAppWindow(fakeStorage(), '', 'absent');
      const result = createDemoRemote(win, fakeStorage()).go('today');
      const step = trackSettled(result);

      await vi.advanceTimersByTimeAsync(PHOTO_WAIT_MS - 200);
      expect(step.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(400);

      expect(step.settled).toBe(true);
      await expect(result).resolves.toBe(true);
    });

    it('does not wait again for a step that follows a miss', async () => {
      const { win } = fakeAppWindow(fakeStorage(), '', 'absent');
      const remote = createDemoRemote(win, fakeStorage());
      const first = remote.go('today');
      await vi.advanceTimersByTimeAsync(PHOTO_WAIT_MS + 200);
      await expect(first).resolves.toBe(true);

      const second = trackSettled(remote.go('pomodoro'));
      await vi.advanceTimersByTimeAsync(200);

      expect(second.settled).toBe(true);
    });
  });

  describe('the recall step', () => {
    it('lands on the home view without pressing c when no card is due', async () => {
      const { win, events } = fakeAppWindow(fakeStorage(), 'insights');
      const result = createDemoRemote(win, seededStorage({ cardDue: false })).go('recall');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
      expect(events).toEqual(['replaceState http://localhost/demo/', 'hashchange']);
    });

    it('presses c when a card is due', async () => {
      const { win, events } = fakeAppWindow(fakeStorage());
      const result = createDemoRemote(win, seededStorage({ cardDue: true })).go('recall');
      await vi.runAllTimersAsync();
      await result;
      expect(events).toContain('keydown c');
    });

    it('still lands on the home view when the due card never comes up', async () => {
      const { win } = fakeAppWindow(fakeStorage());
      const result = createDemoRemote(win, seededStorage({ cardDue: true })).go('recall');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
    });
  });
});
