import { ArrowRight } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';
import { SettingsToggle } from './SettingsToggle';

interface GoalTransferSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Goal Transfer settings section.
 * Handles end-of-day goal transfer preferences.
 */
export const GoalTransferSettings: React.FC<GoalTransferSettingsProps> = ({ form, setField }) => {
  const formatTime = (hour: number): string => {
    if (form.timeFormat === '12h') {
      return `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
    }
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <SettingsSection icon={ArrowRight} title="Goal Transfer">
      <SettingsToggle
        label="Enable goal transfers"
        description="Show option to transfer incomplete goals to tomorrow after end-of-day time"
        checked={form.enableGoalTransfer}
        onChange={(checked) => setField('enableGoalTransfer', checked)}
      />

      {form.enableGoalTransfer && (
        <div>
          <label
            htmlFor="goal-transfer-time"
            className="block text-sm font-medium text-primary mb-2"
          >
            End-of-day time:{' '}
            <span className="text-primary-600 font-semibold">
              {formatTime(form.goalTransferTime)}
            </span>
          </label>
          <div className="flex items-center gap-4">
            <input
              id="goal-transfer-time"
              type="range"
              min="0"
              max="23"
              step="1"
              value={form.goalTransferTime}
              onChange={(e) => setField('goalTransferTime', Number(e.target.value))}
              className="flex-1"
            />
            <select
              value={form.goalTransferTime}
              onChange={(e) => setField('goalTransferTime', Number(e.target.value))}
              className="w-24 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {formatTime(i)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-secondary mt-2">
            Transfer button will appear on incomplete goals after this time
          </p>
        </div>
      )}
    </SettingsSection>
  );
};
