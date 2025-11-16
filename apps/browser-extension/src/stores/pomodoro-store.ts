import { generateId, minutesToSeconds, type PomodoroSession } from '@cuewise/shared';
import { getPomodoroSessions, getSettings, setPomodoroSessions } from '@cuewise/storage';
import { create } from 'zustand';
import { playCompletionSound, playStartSound } from '../utils/sounds';
import { useToastStore } from './toast-store';

type TimerStatus = 'idle' | 'running' | 'paused';
type SessionType = 'work' | 'break' | 'longBreak';

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
  consecutiveWorkSessions: number; // track work sessions for long break
  selectedGoalId: string | null; // goal to work on during session

  // Settings
  workDuration: number; // in minutes
  breakDuration: number; // in minutes
  longBreakDuration: number; // in minutes
  longBreakInterval: number; // sessions before long break
  ambientSound: string;
  ambientVolume: number;

  // Actions
  initialize: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  setSelectedGoal: (goalId: string | null) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  tick: () => void;
  completeSession: () => Promise<void>;
  switchToBreak: () => void;
  switchToLongBreak: () => void;
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
  consecutiveWorkSessions: 0,
  selectedGoalId: null,
  workDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  ambientSound: 'none',
  ambientVolume: 50,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Load settings and sessions
      const [settings, sessions] = await Promise.all([getSettings(), getPomodoroSessions()]);

      const workDuration = settings.pomodoroWorkDuration;
      const breakDuration = settings.pomodoroBreakDuration;
      const longBreakDuration = settings.pomodoroLongBreakDuration;
      const longBreakInterval = settings.pomodoroLongBreakInterval;
      const ambientSound = settings.pomodoroAmbientSound;
      const ambientVolume = settings.pomodoroAmbientVolume;

      set({
        workDuration,
        breakDuration,
        longBreakDuration,
        longBreakInterval,
        ambientSound,
        ambientVolume,
        timeRemaining: minutesToSeconds(workDuration),
        totalTime: minutesToSeconds(workDuration),
        sessions,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error initializing pomodoro store:', error);
      const errorMessage = 'Failed to load pomodoro data. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  reloadSettings: async () => {
    try {
      const settings = await getSettings();
      const { sessionType, status } = get();

      const workDuration = settings.pomodoroWorkDuration;
      const breakDuration = settings.pomodoroBreakDuration;
      const longBreakDuration = settings.pomodoroLongBreakDuration;
      const longBreakInterval = settings.pomodoroLongBreakInterval;
      const ambientSound = settings.pomodoroAmbientSound;
      const ambientVolume = settings.pomodoroAmbientVolume;

      // Only update durations if timer is idle
      if (status === 'idle') {
        let duration = workDuration;
        if (sessionType === 'break') duration = breakDuration;
        if (sessionType === 'longBreak') duration = longBreakDuration;

        set({
          workDuration,
          breakDuration,
          longBreakDuration,
          longBreakInterval,
          ambientSound,
          ambientVolume,
          timeRemaining: minutesToSeconds(duration),
          totalTime: minutesToSeconds(duration),
        });
      } else {
        // Timer is running/paused, just update the stored settings for next session
        set({
          workDuration,
          breakDuration,
          longBreakDuration,
          longBreakInterval,
          ambientSound,
          ambientVolume,
        });
      }
    } catch (error) {
      console.error('Error reloading settings:', error);
      const errorMessage = 'Failed to reload settings. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  setSelectedGoal: (goalId: string | null) => {
    set({ selectedGoalId: goalId });
  },

  start: () => {
    const { sessionType, workDuration, breakDuration, longBreakDuration } = get();
    let duration = workDuration;
    if (sessionType === 'break') duration = breakDuration;
    if (sessionType === 'longBreak') duration = longBreakDuration;

    const currentSessionId = generateId();

    // Play start sound
    playStartSound();

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
    const { sessionType, workDuration, breakDuration, longBreakDuration } = get();
    let duration = workDuration;
    if (sessionType === 'break') duration = breakDuration;
    if (sessionType === 'longBreak') duration = longBreakDuration;

    set({
      status: 'idle',
      currentSessionId: null,
      timeRemaining: minutesToSeconds(duration),
      totalTime: minutesToSeconds(duration),
    });
  },

  skip: () => {
    const { sessionType, consecutiveWorkSessions, longBreakInterval } = get();

    if (sessionType === 'work') {
      // Check if we should switch to long break
      if (consecutiveWorkSessions + 1 >= longBreakInterval) {
        get().switchToLongBreak();
      } else {
        get().switchToBreak();
      }
    } else {
      // From any break back to work
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
    const {
      currentSessionId,
      sessionType,
      totalTime,
      sessions,
      workDuration,
      breakDuration,
      longBreakDuration,
      consecutiveWorkSessions,
      longBreakInterval,
      selectedGoalId,
    } = get();

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
        ...(selectedGoalId && sessionType === 'work' ? { goalId: selectedGoalId } : {}),
      };

      // Save session
      const updatedSessions = [...sessions, completedSession];
      await setPomodoroSessions(updatedSessions);

      set({ sessions: updatedSessions });

      // Auto-switch logic
      if (sessionType === 'work') {
        // Increment consecutive work sessions
        const newConsecutiveCount = consecutiveWorkSessions + 1;

        // Check if it's time for long break
        if (newConsecutiveCount >= longBreakInterval) {
          set({
            sessionType: 'longBreak',
            status: 'idle',
            currentSessionId: null,
            timeRemaining: minutesToSeconds(longBreakDuration),
            totalTime: minutesToSeconds(longBreakDuration),
            consecutiveWorkSessions: newConsecutiveCount,
            selectedGoalId: null, // Clear selected goal
          });
        } else {
          set({
            sessionType: 'break',
            status: 'idle',
            currentSessionId: null,
            timeRemaining: minutesToSeconds(breakDuration),
            totalTime: minutesToSeconds(breakDuration),
            consecutiveWorkSessions: newConsecutiveCount,
            selectedGoalId: null, // Clear selected goal
          });
        }
      } else {
        // Break or long break completed - switch to work
        const resetConsecutive = sessionType === 'longBreak' ? 0 : consecutiveWorkSessions;
        set({
          sessionType: 'work',
          status: 'idle',
          currentSessionId: null,
          timeRemaining: minutesToSeconds(workDuration),
          totalTime: minutesToSeconds(workDuration),
          consecutiveWorkSessions: resetConsecutive,
        });
      }

      // Play completion sound
      playCompletionSound();

      // Show notification
      if ('Notification' in window && Notification.permission === 'granted') {
        let message = 'Session complete!';
        if (sessionType === 'work') {
          const newCount = consecutiveWorkSessions + 1;
          message =
            newCount >= longBreakInterval
              ? 'Work session complete! Time for a long break.'
              : 'Work session complete! Time for a break.';
        } else if (sessionType === 'longBreak') {
          message = 'Long break complete! Ready to focus?';
        } else {
          message = 'Break complete! Ready to focus?';
        }
        new Notification('Pomodoro Timer', { body: message });
      }
    } catch (error) {
      console.error('Error completing pomodoro session:', error);
      const errorMessage = 'Failed to save session. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
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

  switchToLongBreak: () => {
    const { longBreakDuration } = get();
    set({
      sessionType: 'longBreak',
      status: 'idle',
      currentSessionId: null,
      timeRemaining: minutesToSeconds(longBreakDuration),
      totalTime: minutesToSeconds(longBreakDuration),
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
