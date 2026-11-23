import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRemote } from '../public/scripts/demo-remote.js';
import { fakeStorage } from './__fixtures__/storage.fixtures';

const FOCUS_DIALOG = '[role="dialog"][aria-label="Focus mode"]';

function throwingWindow(): Window {
  return {
    get document(): Document {
      throw new Error('document is gone');
    },
  } as unknown as Window;
}

function documentMidNavigation(): Window {
  return {
    document: {
      documentElement: null,
      body: null,
      getElementById: () => null,
      querySelector: () => null,
    },
    location: { hash: '', reload: () => undefined },
  } as unknown as Window;
}

function bodylessWindowWithFocusDialogClosingOnItsOwn(): Window {
  let dialogChecks = 0;
  return {
    document: {
      documentElement: { getAttribute: () => 'glass' },
      body: null,
      getElementById: () => null,
      querySelector: (selector: string) => {
        if (selector === FOCUS_DIALOG) {
          dialogChecks += 1;
          return dialogChecks === 1 ? {} : null;
        }
        return {};
      },
    },
    location: { hash: '' },
  } as unknown as Window;
}

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
});
