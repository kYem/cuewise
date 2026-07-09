import { clampIntervalMinutes, REMINDER_INTERVAL_PRESETS } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import type React from 'react';

interface IntervalCadencePickerProps {
  value: number;
  onChange: (minutes: number) => void;
}

/**
 * Preset buttons plus a custom-minutes input for the "every N minutes" cadence.
 * Shared between the add and edit reminder forms.
 */
export const IntervalCadencePicker: React.FC<IntervalCadencePickerProps> = ({
  value,
  onChange,
}) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {REMINDER_INTERVAL_PRESETS.map((preset) => (
        <button
          type="button"
          key={preset}
          onClick={() => onChange(preset)}
          className={cn(
            'px-2 py-1 rounded-lg text-sm border transition-colors',
            value === preset
              ? 'border-primary-500 text-primary-600'
              : 'border-border text-secondary hover:border-primary-300'
          )}
        >
          {preset}m
        </button>
      ))}
      <input
        type="number"
        min={1}
        max={480}
        value={value}
        onChange={(e) => onChange(clampIntervalMinutes(Number(e.target.value)))}
        className="w-20 px-2 py-1 rounded-lg border border-border text-sm text-primary"
        aria-label="Custom interval in minutes"
      />
      <span className="text-xs text-secondary">min</span>
    </div>
  );
};
