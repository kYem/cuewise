import { NOTIFICATION_SOUNDS, type NotificationSoundType } from '@cuewise/shared';
import { Bell, Play } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { previewSound } from '../../utils/sounds';
import { SettingsSection } from './SettingsSection';

interface NotificationSoundsSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Notification Sounds settings section.
 * Handles start and completion sounds for Pomodoro sessions.
 */
export const NotificationSoundsSettings: React.FC<NotificationSoundsSettingsProps> = ({
  form,
  setField,
}) => {
  return (
    <SettingsSection icon={Bell} title="Notification Sounds">
      {/* Start Sound Selection */}
      <div>
        <label htmlFor="start-sound" className="block text-sm font-medium text-primary mb-2">
          Start Sound
        </label>
        <div className="flex items-center gap-2">
          <select
            id="start-sound"
            value={form.pomodoroStartSound}
            onChange={(e) => setField('pomodoroStartSound', e.target.value)}
            className="flex-1 px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {Object.entries(NOTIFICATION_SOUNDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {form.pomodoroStartSound !== 'none' && (
            <button
              type="button"
              onClick={() =>
                previewSound(form.pomodoroStartSound as NotificationSoundType, 'start')
              }
              className="p-2 rounded-md bg-surface-variant text-primary hover:bg-border transition-all"
              title="Test sound"
            >
              <Play className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-xs text-secondary mt-1">Played when a Pomodoro session starts</p>
      </div>

      {/* Completion Sound Selection */}
      <div>
        <label htmlFor="completion-sound" className="block text-sm font-medium text-primary mb-2">
          Completion Sound
        </label>
        <div className="flex items-center gap-2">
          <select
            id="completion-sound"
            value={form.pomodoroCompletionSound}
            onChange={(e) => setField('pomodoroCompletionSound', e.target.value)}
            className="flex-1 px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {Object.entries(NOTIFICATION_SOUNDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {form.pomodoroCompletionSound !== 'none' && (
            <button
              type="button"
              onClick={() =>
                previewSound(form.pomodoroCompletionSound as NotificationSoundType, 'completion')
              }
              className="p-2 rounded-md bg-surface-variant text-primary hover:bg-border transition-all"
              title="Test sound"
            >
              <Play className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-xs text-secondary mt-1">
          Played when a session completes (work or break)
        </p>
      </div>
    </SettingsSection>
  );
};
