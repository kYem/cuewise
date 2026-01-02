import { Headphones, Settings2 } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';
import { SettingsToggle } from './SettingsToggle';

interface FocusMusicSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
  onOpenSoundsPanel: () => void;
}

/**
 * Focus Music settings section.
 * Handles YouTube music playback during Pomodoro sessions.
 */
export const FocusMusicSettings: React.FC<FocusMusicSettingsProps> = ({
  form,
  setField,
  onOpenSoundsPanel,
}) => {
  return (
    <SettingsSection icon={Headphones} title="Focus Music">
      <SettingsToggle
        label="Enable focus music"
        description="Play YouTube music playlists during Pomodoro sessions"
        checked={form.pomodoroMusicEnabled}
        onChange={(checked) => setField('pomodoroMusicEnabled', checked)}
      />

      {form.pomodoroMusicEnabled && (
        <>
          <SettingsToggle
            label="Auto-start with timer"
            description="Automatically play music when you start a Pomodoro session"
            checked={form.pomodoroMusicAutoStart}
            onChange={(checked) => setField('pomodoroMusicAutoStart', checked)}
          />

          <SettingsToggle
            label="Play during breaks"
            description="Continue playing music during break sessions"
            checked={form.pomodoroMusicPlayDuringBreaks}
            onChange={(checked) => setField('pomodoroMusicPlayDuringBreaks', checked)}
          />

          <button
            type="button"
            onClick={onOpenSoundsPanel}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-surface border border-border rounded-lg hover:bg-surface-variant transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Configure Sounds & Playlists
          </button>

          <p className="text-xs text-secondary">
            Choose ambient sounds or YouTube playlists from the sounds panel
          </p>
        </>
      )}
    </SettingsSection>
  );
};
