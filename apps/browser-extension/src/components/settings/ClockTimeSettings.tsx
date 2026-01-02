import type { TimeFormat } from '@cuewise/shared';
import { Clock } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';
import { SettingsToggle } from './SettingsToggle';

interface ClockTimeSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Clock & Time settings section.
 * Handles clock visibility and time format preferences.
 */
export const ClockTimeSettings: React.FC<ClockTimeSettingsProps> = ({ form, setField }) => {
  return (
    <SettingsSection icon={Clock} title="Clock & Time">
      <SettingsToggle
        label="Show clock on home page"
        description="Display time, date, and greeting on the main page"
        checked={form.showClock}
        onChange={(checked) => setField('showClock', checked)}
      />

      {form.showClock && (
        <div className="grid grid-cols-2 gap-3">
          <TimeFormatButton
            format="12h"
            currentFormat={form.timeFormat}
            onSelect={(f) => setField('timeFormat', f)}
          />
          <TimeFormatButton
            format="24h"
            currentFormat={form.timeFormat}
            onSelect={(f) => setField('timeFormat', f)}
          />
        </div>
      )}
    </SettingsSection>
  );
};

interface TimeFormatButtonProps {
  format: TimeFormat;
  currentFormat: TimeFormat;
  onSelect: (format: TimeFormat) => void;
}

const TimeFormatButton: React.FC<TimeFormatButtonProps> = ({ format, currentFormat, onSelect }) => {
  const isSelected = currentFormat === format;
  const is12Hour = format === '12h';

  return (
    <button
      type="button"
      onClick={() => onSelect(format)}
      className={`p-4 rounded-lg border-2 transition-all ${
        isSelected
          ? 'border-primary-600 bg-primary-50'
          : 'border-border hover:border-primary-300 bg-surface'
      }`}
    >
      <div className="text-2xl font-bold text-primary mb-1">{is12Hour ? '2:30' : '14:30'}</div>
      <div
        className={`text-xs font-medium mb-2 ${is12Hour ? 'text-primary-600' : 'text-transparent'}`}
      >
        {is12Hour ? 'PM' : '.'}
      </div>
      <span className="block text-sm font-medium text-primary">
        {is12Hour ? '12-hour' : '24-hour'}
      </span>
    </button>
  );
};
