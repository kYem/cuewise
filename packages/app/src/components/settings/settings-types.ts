import type { Settings } from '@cuewise/shared';

/** Apply a partial patch to settings (instant-save). */
export type SetSettings = (patch: Partial<Settings>) => void;

/** Props shared by every settings section. */
export interface SettingsSectionProps {
  /** Current settings snapshot from the store. */
  s: Settings;
  /** Persist a change immediately. */
  set: SetSettings;
  /** Active search query; sections/rows hide themselves when they don't match. */
  filter: string;
  /** Reset all settings to defaults (used by Advanced). */
  onReset: () => void;
  /** Open the standalone sounds & playlists panel (used by Sound & music). */
  onOpenSoundsPanel: () => void;
}
