import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable stand-ins for the two Tauri plugins the driver composes.
const openMock = vi.fn<(url: string) => Promise<void>>();
const onOpenUrlMock = vi.fn<(cb: (urls: string[]) => void) => Promise<() => void>>();

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (url: string) => openMock(url),
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: (cb: (urls: string[]) => void) => onOpenUrlMock(cb),
}));

import { createTauriOAuthDriver } from './oauth-driver';

const START_URL = 'https://api.test/v1/auth/google/start?return_uri=cuewise%3A%2F%2Fauth';

interface ListenerHarness {
  /** Delivers deep-link URLs as the plugin would. */
  emit: (urls: string[]) => void;
  stop: ReturnType<typeof vi.fn>;
}

/** Wires onOpenUrl to capture the handler and resolve registration with a spy-able stop. */
function armListener(): ListenerHarness {
  const stop = vi.fn();
  let handler: ((urls: string[]) => void) | null = null;
  onOpenUrlMock.mockImplementation(async (cb) => {
    handler = cb;
    return stop;
  });
  return {
    stop,
    emit: (urls) => {
      if (handler === null) {
        throw new Error('deep-link handler was never registered');
      }
      handler(urls);
    },
  };
}

/** Flushes the microtask queue so the driver's registration .then() runs. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  openMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('createTauriOAuthDriver', () => {
  it('opens the start URL and resolves with the first cuewise://auth callback, then unsubscribes', async () => {
    const listener = armListener();
    const authorize = createTauriOAuthDriver().authorize(START_URL);
    await flush();

    listener.emit(['cuewise://auth?code=one-time-x']);

    await expect(authorize).resolves.toBe('cuewise://auth?code=one-time-x');
    expect(openMock).toHaveBeenCalledWith(START_URL);
    expect(listener.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores deep links outside cuewise://auth and still resolves on a later matching one', async () => {
    const listener = armListener();
    const authorize = createTauriOAuthDriver().authorize(START_URL);
    await flush();

    listener.emit(['cuewise://settings']);
    listener.emit(['cuewise://auth?code=late']);

    await expect(authorize).resolves.toBe('cuewise://auth?code=late');
  });

  it('settles only once when two matching callbacks arrive', async () => {
    const listener = armListener();
    const authorize = createTauriOAuthDriver().authorize(START_URL);
    await flush();

    listener.emit(['cuewise://auth?code=first']);
    listener.emit(['cuewise://auth?code=second']);

    await expect(authorize).resolves.toBe('cuewise://auth?code=first');
    expect(listener.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects after the callback timeout and unsubscribes the listener', async () => {
    const listener = armListener();
    const authorize = createTauriOAuthDriver().authorize(START_URL);
    await flush();

    vi.advanceTimersByTime(300_000);

    await expect(authorize).rejects.toThrow('Timed out waiting for the sign-in callback');
    expect(listener.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects when the browser open fails, and stops a registration that resolves afterwards', async () => {
    // Registration resolves only after open() has already rejected the flow — the returned
    // stop must be invoked immediately so the subscription can't leak.
    const stop = vi.fn();
    let resolveRegistration: (stopFn: () => void) => void = () => {
      throw new Error('registration was never started');
    };
    onOpenUrlMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegistration = resolve;
        })
    );
    openMock.mockRejectedValue(new Error('no browser available'));

    const authorize = createTauriOAuthDriver().authorize(START_URL);
    await expect(authorize).rejects.toThrow('no browser available');

    resolveRegistration(stop);
    await flush();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('rejects when the deep-link listener registration itself fails', async () => {
    onOpenUrlMock.mockRejectedValue(new Error('deep-link plugin unavailable'));
    // Keep open() pending so the registration failure is the only settle path.
    openMock.mockReturnValue(new Promise(() => {}));

    const authorize = createTauriOAuthDriver().authorize(START_URL);

    await expect(authorize).rejects.toThrow('deep-link plugin unavailable');
  });
});
