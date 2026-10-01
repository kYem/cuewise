import { DEFAULT_REMINDER_ACTIVE_HOURS, type ReminderActiveHours } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import type React from 'react';
import { Switch } from '../settings/SettingControls';

export interface ActiveHoursValue {
  enabled: boolean;
  start: string;
  end: string;
  /** 0 = Sunday. Never empty: the last selected day cannot be switched off. */
  days: number[];
}

interface ActiveHoursPickerProps {
  value: ActiveHoursValue;
  onChange: (value: ActiveHoursValue) => void;
}

const WEEK: { day: number; short: string; name: string }[] = [
  { day: 1, short: 'M', name: 'Monday' },
  { day: 2, short: 'T', name: 'Tuesday' },
  { day: 3, short: 'W', name: 'Wednesday' },
  { day: 4, short: 'T', name: 'Thursday' },
  { day: 5, short: 'F', name: 'Friday' },
  { day: 6, short: 'S', name: 'Saturday' },
  { day: 0, short: 'S', name: 'Sunday' },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

/** Picker state for a stored window; with none, a new reminder starts on the default window. */
export function activeHoursValue(
  stored: ReminderActiveHours | undefined,
  enabledWithoutWindow: boolean
): ActiveHoursValue {
  const window = stored ?? DEFAULT_REMINDER_ACTIVE_HOURS;
  const days = window.days !== undefined && window.days.length > 0 ? window.days : ALL_DAYS;
  return {
    enabled: stored !== undefined || enabledWithoutWindow,
    start: window.start,
    end: window.end,
    days,
  };
}

/** The window to store, or none when the reminder may fire around the clock. */
export function toActiveHours(value: ActiveHoursValue): ReminderActiveHours | undefined {
  if (!value.enabled) {
    return undefined;
  }
  if (value.days.length === ALL_DAYS.length) {
    return { start: value.start, end: value.end };
  }
  return { start: value.start, end: value.end, days: [...value.days].sort((a, b) => a - b) };
}

/** "Weekdays", "Weekends", "Mon, Wed", or null for every day. */
export function describeActiveDays(days: number[] | undefined): string | null {
  if (days === undefined || days.length === 0 || days.length === ALL_DAYS.length) {
    return null;
  }
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === WEEKDAYS.join()) {
    return 'Weekdays';
  }
  if (sorted.join() === '0,6') {
    return 'Weekends';
  }
  return WEEK.filter(({ day }) => sorted.includes(day))
    .map(({ name }) => name.slice(0, 3))
    .join(', ');
}

const timeInputClass =
  'w-full px-3 py-2 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary dark:[color-scheme:dark]';

/** The daily window an interval reminder may fire in, and the days it applies to. */
export const ActiveHoursPicker: React.FC<ActiveHoursPickerProps> = ({ value, onChange }) => {
  const toggleDay = (day: number) => {
    if (value.days.includes(day)) {
      if (value.days.length > 1) {
        onChange({ ...value, days: value.days.filter((d) => d !== day) });
      }
      return;
    }
    onChange({ ...value, days: [...value.days, day] });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Active hours</p>
          <p className="text-xs text-secondary">
            {value.enabled ? 'Quiet outside these hours' : 'Off — fires around the clock'}
          </p>
        </div>
        <Switch
          label="Only during active hours"
          checked={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
      </div>

      {value.enabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="reminder-active-start"
                className="block text-xs font-medium text-secondary mb-1"
              >
                From
              </label>
              <input
                id="reminder-active-start"
                type="time"
                value={value.start}
                onChange={(e) => onChange({ ...value, start: e.target.value })}
                required
                className={timeInputClass}
              />
            </div>
            <div>
              <label
                htmlFor="reminder-active-end"
                className="block text-xs font-medium text-secondary mb-1"
              >
                To
              </label>
              <input
                id="reminder-active-end"
                type="time"
                value={value.end}
                onChange={(e) => onChange({ ...value, end: e.target.value })}
                required
                className={timeInputClass}
              />
            </div>
          </div>

          <div className="flex gap-1.5">
            {WEEK.map(({ day, short, name }) => {
              const active = value.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={name}
                  aria-pressed={active}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'h-8 w-8 rounded-full text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary-600 text-white'
                      : 'border border-border bg-surface text-secondary hover:text-primary'
                  )}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
