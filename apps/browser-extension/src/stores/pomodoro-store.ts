import {
  createLogger,
  generateId,
  LogLevel,
  minutesToSeconds,
  type PomodoroSession,
} from '@cuewise/shared';
import { getPomodoroSessions, getSettings, setPomodoroSessions } from '@cuewise/storage';
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../adapters/zustand-chrome-adapter';
import { playCompletionSound, playStartSound } from '../utils/sounds';
import { useToastStore } from './toast-store';

const logger = createLogger({
  prefix: '[PomodoroStore]',
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  includeTimestamp: false,
});

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
  lastTickTime: number | null; // timestamp of last tick (for resuming after all tabs closed)

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

export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set, get) => ({
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
      lastTickTime: null,
      workDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      ambientSound: 'none',
      ambientVolume: 50,

      initialize: async () => {
        try {
          set({ isLoading: true, error: null });

          // Load settings and sessions (state is auto-hydrated by Zustand persist)
          const [settings, sessions] = await Promise.all([getSettings(), getPomodoroSessions()]);

          const workDuration = settings.pomodoroWorkDuration;
          const breakDuration = settings.pomodoroBreakDuration;
          const longBreakDuration = settings.pomodoroLongBreakDuration;
          const longBreakInterval = settings.pomodoroLongBreakInterval;
          const ambientSound = settings.pomodoroAmbientSound;
          const ambientVolume = settings.pomodoroAmbientVolume;

          // Check if timer was running when all tabs closed
          const { status, timeRemaining, lastTickTime } = get();
          logger.debug('Initialize', { status, timeRemaining, lastTickTime });

          if (status === 'running' && lastTickTime && timeRemaining > 0) {
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - lastTickTime) / 1000);
            const adjustedTimeRemaining = Math.max(0, timeRemaining - elapsedSeconds);
            logger.debug('Timer was running', {
              elapsed: elapsedSeconds,
              adjusted: adjustedTimeRemaining,
            });

            if (adjustedTimeRemaining === 0) {
              logger.debug('Timer expired, completing session');
              // Timer expired while tabs were closed
              set({
                workDuration,
                breakDuration,
                longBreakDuration,
                longBreakInterval,
                ambientSound,
                ambientVolume,
                sessions,
                isLoading: false,
                timeRemaining: 0,
              });
              // Complete the session
              get().completeSession();
            } else {
              logger.debug('Timer still active, resuming with adjusted time');
              // Timer still has time left - resume with adjusted time
              set({
                workDuration,
                breakDuration,
                longBreakDuration,
                longBreakInterval,
                ambientSound,
                ambientVolume,
                sessions,
                isLoading: false,
                timeRemaining: adjustedTimeRemaining,
                lastTickTime: now, // Update to current time
              });
            }
          } else {
            logger.debug('No active timer to resume');
            // No running timer or timer was paused
            set({
              workDuration,
              breakDuration,
              longBreakDuration,
              longBreakInterval,
              ambientSound,
              ambientVolume,
              sessions,
              isLoading: false,
            });
          }
        } catch (error) {
          logger.error('Error initializing pomodoro store', error);
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
          logger.error('Error reloading settings', error);
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
          lastTickTime: Date.now(),
        });
      },

      pause: () => {
        set({ status: 'paused' });
      },

      resume: () => {
        set({
          status: 'running',
          lastTickTime: Date.now(),
        });
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
          lastTickTime: null,
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
          set({
            timeRemaining: timeRemaining - 1,
            lastTickTime: Date.now(), // Track last tick time for resume after tab close
          });
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
          // Get settings to check auto-start preference
          const settings = await getSettings();
          const autoStartBreaks = settings.pomodoroAutoStartBreaks;

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

            // Determine next status based on auto-start setting
            const nextStatus = autoStartBreaks ? 'running' : 'idle';
            const nextSessionId = autoStartBreaks ? generateId() : null;

            // Check if it's time for long break
            if (newConsecutiveCount >= longBreakInterval) {
              set({
                sessionType: 'longBreak',
                status: nextStatus,
                currentSessionId: nextSessionId,
                timeRemaining: minutesToSeconds(longBreakDuration),
                totalTime: minutesToSeconds(longBreakDuration),
                consecutiveWorkSessions: newConsecutiveCount,
                selectedGoalId: null, // Clear selected goal
                lastTickTime: autoStartBreaks ? Date.now() : null,
              });
              if (autoStartBreaks) {
                playStartSound();
              }
            } else {
              set({
                sessionType: 'break',
                status: nextStatus,
                currentSessionId: nextSessionId,
                timeRemaining: minutesToSeconds(breakDuration),
                totalTime: minutesToSeconds(breakDuration),
                consecutiveWorkSessions: newConsecutiveCount,
                selectedGoalId: null, // Clear selected goal
                lastTickTime: autoStartBreaks ? Date.now() : null,
              });
              if (autoStartBreaks) {
                playStartSound();
              }
            }
          } else {
            // Break or long break completed - auto-start work if setting enabled
            const resetConsecutive = sessionType === 'longBreak' ? 0 : consecutiveWorkSessions;

            // Determine next status based on auto-start setting
            const nextStatus = autoStartBreaks ? 'running' : 'idle';
            const nextSessionId = autoStartBreaks ? generateId() : null;

            set({
              sessionType: 'work',
              status: nextStatus,
              currentSessionId: nextSessionId,
              timeRemaining: minutesToSeconds(workDuration),
              totalTime: minutesToSeconds(workDuration),
              consecutiveWorkSessions: resetConsecutive,
              lastTickTime: autoStartBreaks ? Date.now() : null,
            });

            if (autoStartBreaks) {
              playStartSound();
            }
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
          logger.error('Error completing pomodoro session', error);
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
    }),
    {
      name: 'pomodoroState', // Storage key
      storage: createJSONStorage(() => chromeLocalStorage),
      partialize: (state) => ({
        // Only persist state data, not functions or loading/error states
        status: state.status,
        sessionType: state.sessionType,
        timeRemaining: state.timeRemaining,
        totalTime: state.totalTime,
        currentSessionId: state.currentSessionId,
        consecutiveWorkSessions: state.consecutiveWorkSessions,
        selectedGoalId: state.selectedGoalId,
        lastTickTime: state.lastTickTime, // For resuming after tabs close
        sessions: state.sessions,
        // Persist settings for timer configuration
        workDuration: state.workDuration,
        breakDuration: state.breakDuration,
        longBreakDuration: state.longBreakDuration,
        longBreakInterval: state.longBreakInterval,
        ambientSound: state.ambientSound,
        ambientVolume: state.ambientVolume,
      }),
      skipHydration: false, // Auto-hydrate on mount
    }
  )
);

/**
 * React hook to sync Pomodoro state across tabs
 * Listens to chrome.storage changes and rehydrates the store
 *
 * Usage: Call this hook in components that need cross-tab synchronization
 * @example
 * export const PomodoroTimer = () => {
 *   usePomodoroStorageSync();
 *   // ... rest of component
 * }
 */
export function usePomodoroStorageSync() {
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      // Only react to local storage changes
      if (areaName !== 'local') return;

      // Check if pomodoroState changed
      const pomodoroStateChange = changes.pomodoroState;
      if (!pomodoroStateChange) return;

      // Trigger rehydration to sync with other tabs
      // This will update the Zustand store with the latest storage value
      usePomodoroStore.persist.rehydrate();

      // Parse the new state to check for timer completion
      try {
        const newStateJson = pomodoroStateChange.newValue;
        if (newStateJson && typeof newStateJson === 'string') {
          const parsed = JSON.parse(newStateJson);
          // Handle timer completion
          if (parsed?.state?.timeRemaining === 0 && parsed?.state?.status === 'running') {
            usePomodoroStore.getState().completeSession();
          }
        }
      } catch (_error) {
        // Ignore parse errors
      }
    };

    // Register listener
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    // Cleanup on unmount
    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, []); // Empty deps - only set up once per component mount
}
