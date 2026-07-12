import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countInvokes,
  createLocalStorageStub,
  ENABLED_KEY,
  emitSampleFrame,
  emitStopped,
  invokeMock,
  resetPostureMocks,
  START_FAILED_ERROR,
  STOPPED_ERROR,
  toastErrorMock,
  UNREADABLE_ERROR,
  unlistenSpies,
} from './__fixtures__/posture-controller.fixtures';
import { getPostureState, startPosture, stopPosture } from './posture-controller';

vi.mock('@tauri-apps/api/core', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return { invoke: fixtures.invokeMock };
});

vi.mock('@tauri-apps/api/event', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return { listen: fixtures.listenMock };
});

vi.mock('@cuewise/app', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return {
    useToastStore: {
      getState: () => ({
        error: fixtures.toastErrorMock,
        warning: fixtures.toastWarningMock,
      }),
    },
  };
});

vi.mock('@cuewise/shared', async () => {
  const fixtures = await import('./__fixtures__/posture-controller.fixtures');
  return {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    getNotifier: () => ({ notify: fixtures.notifyMock, clear: vi.fn() }),
  };
});

// One macrotask turn drains the attach-listeners → invoke promise chain.
async function flush(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function startTracking(): Promise<void> {
  startPosture();
  await flush();
  expect(countInvokes('start_posture')).toBe(1);
  expect(getPostureState().tracking).toBe(true);
}

describe('posture controller lifecycle', () => {
  let localStorageStub: ReturnType<typeof createLocalStorageStub>;

  beforeEach(() => {
    resetPostureMocks();
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal('localStorage', localStorageStub);
  });

  afterEach(async () => {
    // The controller keeps module-level session state — tear it down so each
    // test starts from idle.
    stopPosture();
    await flush();
    vi.unstubAllGlobals();
  });

  it('an unexpected sidecar stop surfaces the error and keeps the auto-resume pref', async () => {
    await startTracking();

    emitStopped();

    expect(getPostureState().tracking).toBe(false);
    expect(getPostureState().error).toBe(STOPPED_ERROR);
    expect(toastErrorMock).toHaveBeenCalledWith(STOPPED_ERROR);
    // Transient failures keep the opt-in so tracking can auto-resume next boot.
    expect(localStorageStub.getItem(ENABLED_KEY)).toBe('1');
    for (const unlisten of unlistenSpies) {
      expect(unlisten).toHaveBeenCalled();
    }
  });

  it('a manual stop clears a stale error so the tray warning does not linger', async () => {
    await startTracking();
    for (let i = 0; i < 5; i += 1) {
      emitSampleFrame('not json');
    }
    expect(getPostureState().error).toBe(UNREADABLE_ERROR);

    stopPosture();

    expect(getPostureState().tracking).toBe(false);
    expect(getPostureState().error).toBeNull();
  });

  it('a failed start surfaces a toast and clears the auto-resume pref', async () => {
    invokeMock.mockRejectedValueOnce(new Error('camera denied'));

    startPosture();
    await flush();

    expect(getPostureState().tracking).toBe(false);
    expect(getPostureState().error).toBe(START_FAILED_ERROR);
    expect(toastErrorMock).toHaveBeenCalledWith(START_FAILED_ERROR);
    // A failed start must not retry every boot — the pref is cleared.
    expect(localStorageStub.getItem(ENABLED_KEY)).toBe('0');
  });

  it('a readable frame becomes the live sample and clears any prior error', async () => {
    await startTracking();
    for (let i = 0; i < 5; i += 1) {
      emitSampleFrame('not json');
    }
    expect(getPostureState().error).toBe(UNREADABLE_ERROR);

    emitSampleFrame(JSON.stringify({ status: 'good' }));

    expect(getPostureState().sample).toMatchObject({ status: 'good' });
    expect(getPostureState().error).toBeNull();
  });
});
