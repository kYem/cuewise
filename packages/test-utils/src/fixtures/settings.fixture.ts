import { DEFAULT_SETTINGS, type Settings } from '@cuewise/shared';

export const defaultSettings: Settings = {
  ...DEFAULT_SETTINGS,
  // Deterministic, jsdom-friendly test overrides (differ from prod on purpose):
  theme: 'light',
  colorTheme: 'purple',
  pomodoroMusicEnabled: false,
  pomodoroMusicAutoStart: true,
};
