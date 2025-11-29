import type { Settings } from '@cuewise/shared';

export const defaultSettings: Settings = {
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  pomodoroLongBreakDuration: 15,
  pomodoroLongBreakInterval: 4,
  pomodoroAutoStartBreaks: true,
  pomodoroAmbientSound: 'none',
  pomodoroAmbientVolume: 50,
  enableNotifications: true,
  theme: 'light',
  quoteChangeInterval: 10,
  timeFormat: '12h',
  syncEnabled: false,
  colorTheme: 'purple',
  layoutDensity: 'comfortable',
  showThemeSwitcher: false,
  enableGoalTransfer: true,
  goalTransferTime: 20,
  logLevel: 'error',
  hasSeenOnboarding: false,
};
