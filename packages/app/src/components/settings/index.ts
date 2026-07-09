// Settings modal building blocks (redesigned, theme-aware)
export { PresetGrid } from './PresetGrid';
export {
  Segmented,
  SelectControl,
  SettingDivider,
  SettingRow,
  SettingSubgroup,
  Stepper,
  Switch,
} from './SettingControls';
export {
  SECTION_IDS,
  SETTINGS_SECTIONS,
  type SectionId,
  type SettingsSection,
} from './SettingsSections';
export {
  POMODORO_KEYS,
  planSettingsSideEffects,
  type SettingsSideEffects,
} from './settings-apply';
export { quoteIntervalToSeconds } from './settings-interval';
export { settingsMatch } from './settings-match';
export type { SetSettings, SettingsSectionProps } from './settings-types';
export { ThumbPicker } from './ThumbPicker';
