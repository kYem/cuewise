import { Clock } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';
import { SettingsSlider } from './SettingsSlider';

interface PomodoroSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Pomodoro Timer settings section.
 * Handles work duration, break durations, and long break interval.
 */
export const PomodoroSettings: React.FC<PomodoroSettingsProps> = ({ form, setField }) => {
  return (
    <SettingsSection icon={Clock} title="Pomodoro Timer">
      <SettingsSlider
        id="work-duration"
        label="Work Duration"
        value={form.pomodoroWorkDuration}
        min={1}
        max={60}
        unit="minutes"
        onChange={(value) => setField('pomodoroWorkDuration', value)}
      />

      <SettingsSlider
        id="break-duration"
        label="Short Break Duration"
        value={form.pomodoroBreakDuration}
        min={1}
        max={30}
        unit="minutes"
        onChange={(value) => setField('pomodoroBreakDuration', value)}
      />

      <SettingsSlider
        id="long-break-duration"
        label="Long Break Duration"
        value={form.pomodoroLongBreakDuration}
        min={10}
        max={60}
        unit="minutes"
        onChange={(value) => setField('pomodoroLongBreakDuration', value)}
      />

      <SettingsSlider
        id="long-break-interval"
        label="Long Break After"
        value={form.pomodoroLongBreakInterval}
        min={2}
        max={10}
        formatValue={(v) => `${v} session${v !== 1 ? 's' : ''}`}
        onChange={(value) => setField('pomodoroLongBreakInterval', value)}
      />
    </SettingsSection>
  );
};
