import { Cloud, CloudOff } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';

interface ChromeSyncSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Chrome Sync settings section.
 * Handles cross-device synchronization preferences.
 */
export const ChromeSyncSettings: React.FC<ChromeSyncSettingsProps> = ({ form, setField }) => {
  const Icon = form.syncEnabled ? Cloud : CloudOff;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${form.syncEnabled ? 'text-primary-600' : 'text-tertiary'}`} />
        <h3 className="text-lg font-semibold text-primary">Chrome Sync</h3>
      </div>

      <div className="pl-7">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={form.syncEnabled}
              onChange={(e) => setField('syncEnabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
          </div>
          <div>
            <span className="text-sm font-medium text-primary">Enable Chrome Sync</span>
            <p className="text-xs text-secondary">
              Sync your custom quotes, goals, and reminders across all Chrome browsers where you're
              signed in
            </p>
            <p className="text-xs text-orange-600 mt-1">
              Note: Built-in quotes stay in local storage. Sync has a 100KB total limit and 8KB
              per-item limit. Pomodoro sessions may exceed limits over time.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
};
