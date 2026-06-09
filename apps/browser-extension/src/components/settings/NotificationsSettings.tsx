import { Bell, BellOff } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsToggle } from './SettingsToggle';

interface NotificationsSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Notifications settings section.
 * Handles browser notification preferences and completion celebrations.
 */
export const NotificationsSettings: React.FC<NotificationsSettingsProps> = ({ form, setField }) => {
  const Icon = form.enableNotifications ? Bell : BellOff;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Icon
          className={`w-5 h-5 ${form.enableNotifications ? 'text-primary-600' : 'text-tertiary'}`}
        />
        <h3 className="text-lg font-semibold text-primary">Notifications</h3>
      </div>

      <div className="pl-7 space-y-4">
        <SettingsToggle
          label="Enable notifications"
          description="Get notified when Pomodoro sessions complete and reminders are due"
          checked={form.enableNotifications}
          onChange={(checked) => setField('enableNotifications', checked)}
        />
        <SettingsToggle
          label="Celebrate completions"
          description="Play a short animation when you finish a focus session or all of today's tasks"
          checked={form.celebrationsEnabled}
          onChange={(checked) => setField('celebrationsEnabled', checked)}
        />
      </div>
    </section>
  );
};
