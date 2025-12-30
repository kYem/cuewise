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

// Mock toast store
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: vi.fn(),
    }),
  },
}));

// Mock sounds
vi.mock('../utils/sounds', () => ({
  playCompletionSound: vi.fn(),
  playStartSound: vi.fn(),
}));

// Mock Notification API
const mockNotification = vi.fn();
globalThis.Notification = mockNotification as unknown as typeof Notification;
Object.defineProperty(globalThis.Notification, 'permission', {
  writable: true,
  value: 'granted',
});

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
