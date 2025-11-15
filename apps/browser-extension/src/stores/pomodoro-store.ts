import {
  type PomodoroSession,
  generateId,
  minutesToSeconds,
} from '@cuewise/shared';
import { getPomodoroSessions, getSettings, setPomodoroSessions } from '@cuewise/storage';
import { create } from 'zustand';

type TimerStatus = 'idle' | 'running' | 'paused';
type SessionType = 'work' | 'break';

interface PomodoroStore {
  // State
  status: TimerStatus;
  sessionType: SessionType;
  timeRemaining: number; // in seconds
  totalTime: number; // in seconds
  sessions: PomodoroSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;

  // Settings
  workDuration: number; // in minutes
  breakDuration: number; // in minutes

  // Actions
  initialize: () => Promise<void>;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  tick: () => void;
  completeSession: () => Promise<void>;
  switchToBreak: () => void;
  switchToWork: () => void;
}

export const usePomodoroStore = create<PomodoroStore>((set, get) => ({
  // Initial state
  status: 'idle',
  sessionType: 'work',
  timeRemaining: 0,
  totalTime: 0,
  sessions: [],
  currentSessionId: null,
  isLoading: true,
  error: null,
  workDuration: 25,
  breakDuration: 5,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Load settings and sessions
      const [settings, sessions] = await Promise.all([
        getSettings(),
        getPomodoroSessions(),
      ]);

      const workDuration = settings.pomodoroWorkDuration;
      const breakDuration = settings.pomodoroBreakDuration;

      set({
        workDuration,
        breakDuration,
        timeRemaining: minutesToSeconds(workDuration),
        totalTime: minutesToSeconds(workDuration),
        sessions,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error initializing pomodoro store:', error);
      set({ error: 'Failed to load pomodoro data', isLoading: false });
    }
  },

  start: () => {
    const { sessionType, workDuration, breakDuration } = get();
    const duration = sessionType === 'work' ? workDuration : breakDuration;
    const currentSessionId = generateId();

    set({
      status: 'running',
      currentSessionId,
      timeRemaining: minutesToSeconds(duration),
      totalTime: minutesToSeconds(duration),
    });
  },

  pause: () => {
    set({ status: 'paused' });
  },

  resume: () => {
    set({ status: 'running' });
  },

  reset: () => {
    const { sessionType, workDuration, breakDuration } = get();
    const duration = sessionType === 'work' ? workDuration : breakDuration;

    set({
      status: 'idle',
      currentSessionId: null,
      timeRemaining: minutesToSeconds(duration),
      totalTime: minutesToSeconds(duration),
    });
  },

  skip: () => {
    const { sessionType } = get();

    if (sessionType === 'work') {
      get().switchToBreak();
    } else {
      get().switchToWork();
    }
  },

  tick: () => {
    const { status, timeRemaining } = get();

    if (status !== 'running') return;

    if (timeRemaining > 0) {
      set({ timeRemaining: timeRemaining - 1 });
    } else {
      // Timer completed
      get().completeSession();
    }
  },

  completeSession: async () => {
    const { currentSessionId, sessionType, totalTime, sessions, workDuration, breakDuration } =
      get();

    if (!currentSessionId) return;

    try {
      // Create completed session
      const completedSession: PomodoroSession = {
        id: currentSessionId,
        startedAt: new Date(Date.now() - totalTime * 1000).toISOString(),
        completedAt: new Date().toISOString(),
        interrupted: false,
        duration: totalTime / 60, // convert back to minutes
        type: sessionType,
      };

      // Save session
      const updatedSessions = [...sessions, completedSession];
      await setPomodoroSessions(updatedSessions);

      set({ sessions: updatedSessions });

      // Auto-switch to break after work or vice versa
      if (sessionType === 'work') {
        set({
          sessionType: 'break',
          status: 'idle',
          currentSessionId: null,
          timeRemaining: minutesToSeconds(breakDuration),
          totalTime: minutesToSeconds(breakDuration),
        });
      } else {
        set({
          sessionType: 'work',
          status: 'idle',
          currentSessionId: null,
          timeRemaining: minutesToSeconds(workDuration),
          totalTime: minutesToSeconds(workDuration),
        });
      }

      // Play notification sound or show notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const message =
          sessionType === 'work'
            ? 'Work session complete! Time for a break.'
            : 'Break complete! Ready to focus?';
        new Notification('Pomodoro Timer', { body: message });
      }
    } catch (error) {
      console.error('Error completing pomodoro session:', error);
      set({ error: 'Failed to save session' });
    }
  },

  switchToBreak: () => {
    const { breakDuration } = get();
    set({
      sessionType: 'break',
      status: 'idle',
      currentSessionId: null,
      timeRemaining: minutesToSeconds(breakDuration),
      totalTime: minutesToSeconds(breakDuration),
    });
  },

  switchToWork: () => {
    const { workDuration } = get();
    set({
      sessionType: 'work',
      status: 'idle',
      currentSessionId: null,
      timeRemaining: minutesToSeconds(workDuration),
      totalTime: minutesToSeconds(workDuration),
    });
  },
}));
