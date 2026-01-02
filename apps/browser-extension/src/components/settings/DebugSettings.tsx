import type { SettingsLogLevel } from '@cuewise/shared';
import { Bug } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';

interface DebugSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

const LOG_LEVEL_OPTIONS: { value: SettingsLogLevel; label: string }[] = [
  { value: 'none', label: 'None - No console logs' },
  { value: 'error', label: 'Error - Only errors' },
  { value: 'warn', label: 'Warning - Errors and warnings' },
  { value: 'info', label: 'Info - Errors, warnings, and info' },
  { value: 'debug', label: 'Debug - All logs (verbose)' },
];

/**
 * Debug settings section.
 * Handles console logging level preferences.
 */
export const DebugSettings: React.FC<DebugSettingsProps> = ({ form, setField }) => {
  return (
    <SettingsSection icon={Bug} title="Debug">
      <div>
        <label htmlFor="log-level" className="block text-sm font-medium text-primary mb-2">
          Console Log Level
        </label>
        <select
          id="log-level"
          value={form.logLevel}
          onChange={(e) => setField('logLevel', e.target.value as SettingsLogLevel)}
          className="w-full px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {LOG_LEVEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-secondary mt-2">
          Control what messages appear in the browser console. Higher levels include all lower
          levels.
        </p>
      </div>
    </SettingsSection>
  );
};
