import { configurePlatform } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sounds from '../utils/sounds';
import { usePomodoroStore } from './pomodoro-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getPomodoroSessions: vi.fn(),
  setPomodoroSessions: vi.fn(),
  getSettings: vi.fn(),
}));

// Mock toast store with module-level fns so each level is inspectable across getState() calls.
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastSuccess = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: toastError,
      warning: toastWarning,
      success: toastSuccess,
    }),
  },
}));

// Mock sounds
vi.mock('../utils/sounds', () => ({
  playCompletionSound: vi.fn(),
  playStartSound: vi.fn(),
}));

const { celebrateMock } = vi.hoisted(() => ({ celebrateMock: vi.fn() }));

vi.mock('./celebration-store', () => ({
  useCelebrationStore: {
    getState: () => ({ celebrate: celebrateMock, active: null, dismiss: vi.fn() }),
  },
}));

// The Notifier is injected; assert against it instead of the global Notification.
const fakeNotifier = {
  notify: vi.fn(() => Promise.resolve()),
  clear: vi.fn(() => Promise.resolve()),
};

// Test utilities
const setupWorkSession = (overrides = {}) => {
  usePomodoroStore.setState({
    status: 'running',
    sessionType: 'work',
    currentSessionId: 'session-123',
    timeRemaining: 0,
    totalTime: 25 * 60,
    consecutiveWorkSessions: 0,
    ...overrides,
  });
};

const setupBreakSession = (type: 'break' | 'longBreak' = 'break', overrides = {}) => {
  usePomodoroStore.setState({
    status: 'running',
    sessionType: type,
    currentSessionId: `${type}-123`,
    timeRemaining: 0,
    totalTime: type === 'break' ? 5 * 60 : 15 * 60,
    ...overrides,
  });
};

const expectAutoStarted = (sessionType: 'break' | 'longBreak') => {
  const state = usePomodoroStore.getState();
  const expectedDuration = sessionType === 'break' ? 5 * 60 : 15 * 60;

  expect(state.status).toBe('running');
  expect(state.sessionType).toBe(sessionType);
  expect(state.currentSessionId).toBeTruthy();
  expect(state.timeRemaining).toBe(expectedDuration);
  expect(state.lastTickTime).toBeTruthy();
  expect(sounds.playStartSound).toHaveBeenCalled();
};

const expectIdleTransition = (sessionType: 'work' | 'break' | 'longBreak') => {
  const state = usePomodoroStore.getState();

  expect(state.status).toBe('idle');
  expect(state.sessionType).toBe(sessionType);
  expect(state.currentSessionId).toBeNull();
  expect(state.lastTickTime).toBeNull();
  expect(sounds.playStartSound).not.toHaveBeenCalled();
};

describe('Pomodoro Store - Auto-Start Breaks', () => {
  beforeEach(() => {
    // Reset store to initial state
    usePomodoroStore.setState({
      status: 'idle',
      sessionType: 'work',
      timeRemaining: 0,
      totalTime: 0,
      sessions: [],
      currentSessionId: null,
      isLoading: false,
      error: null,
      consecutiveWorkSessions: 0,
      selectedGoalId: null,
      lastTickTime: null,
      workDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      ambientSound: 'none',
      ambientVolume: 50,
    });

    // Clear all mocks
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(storage.getPomodoroSessions).mockResolvedValue([]);
    vi.mocked(storage.setPomodoroSessions).mockResolvedValue({ success: true });
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);

    configurePlatform({ notifier: fakeNotifier });
  });

  describe('completeSession notification', () => {
    it('notifies via the platform notifier when a work session completes', async () => {
      setupWorkSession();

      await usePomodoroStore.getState().completeSession();

      expect(fakeNotifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pomodoro Timer',
          body: expect.stringContaining('complete'),
        })
      );
    });

    it('still saves the session when the notification fails', async () => {
      fakeNotifier.notify.mockRejectedValueOnce(new Error('notify failed'));
      setupWorkSession();

      await expect(usePomodoroStore.getState().completeSession()).resolves.toBeUndefined();

      expect(storage.setPomodoroSessions).toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
    });
  });

  describe('completeSession with auto-start enabled', () => {
    it('should auto-start break when work session completes', async () => {
      setupWorkSession();
      await usePomodoroStore.getState().completeSession();

      expectAutoStarted('break');
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
      expect(storage.setPomodoroSessions).toHaveBeenCalled();
    });

    it('should auto-start long break when interval is reached', async () => {
      setupWorkSession({ consecutiveWorkSessions: 3, longBreakInterval: 4 });
      await usePomodoroStore.getState().completeSession();

      expectAutoStarted('longBreak');
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });

    it('should clear selected goal when auto-starting break', async () => {
      setupWorkSession({ selectedGoalId: 'goal-123' });
      await usePomodoroStore.getState().completeSession();

      expect(usePomodoroStore.getState().selectedGoalId).toBeNull();
    });
  });

  describe('completeSession with auto-start disabled', () => {
    beforeEach(() => {
      vi.mocked(storage.getSettings).mockResolvedValue({
        ...defaultSettings,
        pomodoroAutoStartBreaks: false,
      });
    });

    it('should not auto-start break when work session completes', async () => {
      setupWorkSession();
      await usePomodoroStore.getState().completeSession();

      expectIdleTransition('break');
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });

    it('should not auto-start long break when interval is reached', async () => {
      setupWorkSession({ consecutiveWorkSessions: 3, longBreakInterval: 4 });
      await usePomodoroStore.getState().completeSession();

      expectIdleTransition('longBreak');
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });
  });

  describe('completeSession - break to work transitions with auto-start enabled', () => {
    it('should auto-start work session after break completes', async () => {
      setupBreakSession('break', { consecutiveWorkSessions: 1 });
      await usePomodoroStore.getState().completeSession();

      const state = usePomodoroStore.getState();
      expect(state.status).toBe('running');
      expect(state.sessionType).toBe('work');
      expect(state.currentSessionId).toBeTruthy();
      expect(state.timeRemaining).toBe(25 * 60);
      expect(state.lastTickTime).toBeTruthy();
      expect(state.consecutiveWorkSessions).toBe(1);
      expect(sounds.playStartSound).toHaveBeenCalled();
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });

    it('should auto-start work session after long break completes and reset count', async () => {
      setupBreakSession('longBreak', { consecutiveWorkSessions: 4 });
      await usePomodoroStore.getState().completeSession();

      const state = usePomodoroStore.getState();
      expect(state.status).toBe('running');
      expect(state.sessionType).toBe('work');
      expect(state.currentSessionId).toBeTruthy();
      expect(state.timeRemaining).toBe(25 * 60);
      expect(state.lastTickTime).toBeTruthy();
      expect(state.consecutiveWorkSessions).toBe(0);
      expect(sounds.playStartSound).toHaveBeenCalled();
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });
  });

  describe('completeSession - break to work transitions with auto-start disabled', () => {
    beforeEach(() => {
      vi.mocked(storage.getSettings).mockResolvedValue({
        ...defaultSettings,
        pomodoroAutoStartBreaks: false,
      });
    });

    it('should not auto-start work session after break completes', async () => {
      setupBreakSession('break', { consecutiveWorkSessions: 1 });
      await usePomodoroStore.getState().completeSession();

      expectIdleTransition('work');
      expect(usePomodoroStore.getState().consecutiveWorkSessions).toBe(1);
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });

    it('should not auto-start work session after long break completes', async () => {
      setupBreakSession('longBreak', { consecutiveWorkSessions: 4 });
      await usePomodoroStore.getState().completeSession();

      expectIdleTransition('work');
      expect(usePomodoroStore.getState().consecutiveWorkSessions).toBe(0);
      expect(sounds.playCompletionSound).toHaveBeenCalledOnce();
    });
  });

  describe('completeSession - consecutive work sessions tracking', () => {
    it('should increment consecutive work sessions', async () => {
      setupWorkSession({ consecutiveWorkSessions: 1 });
      await usePomodoroStore.getState().completeSession();

      expect(usePomodoroStore.getState().consecutiveWorkSessions).toBe(2);
    });

    it('should maintain consecutive count after short break', async () => {
      setupBreakSession('break', { consecutiveWorkSessions: 2 });
      await usePomodoroStore.getState().completeSession();

      expect(usePomodoroStore.getState().consecutiveWorkSessions).toBe(2);
    });

    it('should reset consecutive count after long break', async () => {
      setupBreakSession('longBreak', { consecutiveWorkSessions: 4 });
      await usePomodoroStore.getState().completeSession();

      expect(usePomodoroStore.getState().consecutiveWorkSessions).toBe(0);
    });
  });

  describe('completeSession - session saving', () => {
    it('should save completed work session with goalId if selected', async () => {
      setupWorkSession({ selectedGoalId: 'goal-123' });
      await usePomodoroStore.getState().completeSession();

      const savedSessions = vi.mocked(storage.setPomodoroSessions).mock.calls[0][0];
      expect(savedSessions[0]).toMatchObject({
        type: 'work',
        goalId: 'goal-123',
        interrupted: false,
      });
    });

    it('should save completed break session without goalId', async () => {
      setupBreakSession('break', { selectedGoalId: 'goal-123' });
      await usePomodoroStore.getState().completeSession();

      const savedSessions = vi.mocked(storage.setPomodoroSessions).mock.calls[0][0];
      expect(savedSessions[0]).toMatchObject({ type: 'break' });
      expect(savedSessions[0]).not.toHaveProperty('goalId');
    });
  });

  describe('initialize - active timer handling', () => {
    it('should NOT modify lastTickTime when timer is actively ticking', async () => {
      // Simulate: timer is running and was just ticked (lastTickTime is recent)
      const now = Date.now();
      const originalLastTickTime = now - 500; // Ticked 500ms ago
      const currentTimeRemaining = 280; // 4:40 remaining

      usePomodoroStore.setState({
        status: 'running',
        sessionType: 'break',
        currentSessionId: 'break-123',
        timeRemaining: currentTimeRemaining,
        totalTime: 5 * 60,
        lastTickTime: originalLastTickTime,
        consecutiveWorkSessions: 1,
      });

      // Call initialize (simulates navigating to Pomodoro page)
      await usePomodoroStore.getState().initialize();

      // lastTickTime should NOT be updated - let the active ticker manage it
      const state = usePomodoroStore.getState();
      expect(state.timeRemaining).toBe(currentTimeRemaining);
      expect(state.lastTickTime).toBe(originalLastTickTime); // Should NOT change
      expect(state.status).toBe('running');
      expect(state.sessionType).toBe('break');
    });

    it('should STILL apply recovery when timer was running but tabs were closed', async () => {
      // Simulate: timer was running but all tabs closed 10 seconds ago
      const now = Date.now();
      const originalTimeRemaining = 280; // 4:40 remaining

      usePomodoroStore.setState({
        status: 'running',
        sessionType: 'break',
        currentSessionId: 'break-123',
        timeRemaining: originalTimeRemaining,
        totalTime: 5 * 60,
        lastTickTime: now - 10000, // Ticked 10 seconds ago (tabs were closed)
        consecutiveWorkSessions: 1,
      });

      await usePomodoroStore.getState().initialize();

      // timeRemaining SHOULD be adjusted (recovery logic)
      const state = usePomodoroStore.getState();
      expect(state.timeRemaining).toBe(originalTimeRemaining - 10); // Adjusted by ~10 seconds
    });
  });
});

describe('completeSession celebration trigger', () => {
  beforeEach(() => {
    celebrateMock.mockClear();
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    // setPomodoroSessions returns Promise<StorageResult> = { success: boolean }.
    vi.mocked(storage.setPomodoroSessions).mockResolvedValue({ success: true });
  });

  it('celebrates when a work session completes', async () => {
    setupWorkSession();
    await usePomodoroStore.getState().completeSession();
    expect(celebrateMock).toHaveBeenCalledWith('pomodoro');
  });

  it('does not celebrate when a break completes', async () => {
    setupBreakSession('break');
    await usePomodoroStore.getState().completeSession();
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it('does not celebrate when a long break completes', async () => {
    setupBreakSession('longBreak');
    await usePomodoroStore.getState().completeSession();
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it('does not celebrate on a background-recovery completion', async () => {
    setupWorkSession();
    await usePomodoroStore.getState().completeSession({ isRecovery: true });
    expect(celebrateMock).not.toHaveBeenCalled();
  });
});

describe('Pomodoro Store - tick wall-clock reconciliation (#159)', () => {
  beforeEach(() => {
    usePomodoroStore.setState({
      status: 'idle',
      sessionType: 'work',
      timeRemaining: 0,
      totalTime: 0,
      sessions: [],
      currentSessionId: null,
      isLoading: false,
      error: null,
      consecutiveWorkSessions: 0,
      selectedGoalId: null,
      lastTickTime: null,
      workDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      ambientSound: 'none',
      ambientVolume: 50,
    });
    vi.clearAllMocks();
    vi.mocked(storage.getPomodoroSessions).mockResolvedValue([]);
    vi.mocked(storage.setPomodoroSessions).mockResolvedValue({ success: true });
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    configurePlatform({ notifier: fakeNotifier });
  });

  it('decrements by one second on a normal ~1s tick', () => {
    usePomodoroStore.setState({
      status: 'running',
      currentSessionId: 'sess-1',
      timeRemaining: 100,
      lastTickTime: Date.now() - 1000,
    });

    usePomodoroStore.getState().tick();

    expect(usePomodoroStore.getState().timeRemaining).toBe(99);
  });

  it('catches up by the real elapsed time when the tab was throttled (drift fix)', () => {
    // A backgrounded tab throttles setInterval, so tick() fires late. It must
    // decrement by the seconds that actually elapsed, not a flat -1.
    usePomodoroStore.setState({
      status: 'running',
      currentSessionId: 'sess-1',
      timeRemaining: 100,
      lastTickTime: Date.now() - 5000, // five real seconds since the last tick
    });

    usePomodoroStore.getState().tick();

    expect(usePomodoroStore.getState().timeRemaining).toBe(95);
  });

  it('is a no-op when less than a second has elapsed', () => {
    usePomodoroStore.setState({
      status: 'running',
      currentSessionId: 'sess-1',
      timeRemaining: 100,
      lastTickTime: Date.now() - 400,
    });

    usePomodoroStore.getState().tick();

    expect(usePomodoroStore.getState().timeRemaining).toBe(100);
  });

  it('does nothing when the timer is not running', () => {
    usePomodoroStore.setState({
      status: 'paused',
      timeRemaining: 100,
      lastTickTime: Date.now() - 5000,
    });

    usePomodoroStore.getState().tick();

    expect(usePomodoroStore.getState().timeRemaining).toBe(100);
  });

  it('completes the session (never negative) when elapsed meets or exceeds what remains', async () => {
    usePomodoroStore.setState({
      status: 'running',
      sessionType: 'work',
      currentSessionId: 'sess-1',
      timeRemaining: 3,
      totalTime: 25 * 60,
      lastTickTime: Date.now() - 5000, // more elapsed than remains
    });

    usePomodoroStore.getState().tick();
    await vi.waitFor(() => expect(storage.setPomodoroSessions).toHaveBeenCalled());

    expect(usePomodoroStore.getState().timeRemaining).toBeGreaterThanOrEqual(0);
  });
});
