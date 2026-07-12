import { cn } from '@cuewise/ui';
import { Minus, Plus } from 'lucide-react';
import type React from 'react';
import { settingsMatch } from './settings-match';

interface SettingRowProps {
  label: string;
  /** Inline helper text shown under the label. */
  help?: string;
  /** Extra search terms that should surface this row. */
  keywords?: string;
  /** Active search query; the row hides itself when it doesn't match. */
  filter: string;
  /** Stack the control under the label instead of placing it inline on the right. */
  stack?: boolean;
  children: React.ReactNode;
}

/**
 * A single settings row: label + inline help on the left, control on the right
 * (or stacked below). Hides itself when it doesn't match the active search query.
 */
export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  help,
  keywords = '',
  filter,
  stack = false,
  children,
}) => {
  if (!settingsMatch(filter, label, help, keywords)) {
    return null;
  }

  const labelEl = (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-medium text-primary">{label}</span>
      {help && <span className="max-w-[420px] text-xs leading-snug text-tertiary">{help}</span>}
    </div>
  );

  if (stack) {
    return (
      <div className="flex flex-col items-stretch gap-3 py-3">
        {labelEl}
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-[40px] items-center justify-between gap-6 py-3">
      {labelEl}
      <div className="flex flex-none items-center">{children}</div>
    </div>
  );
};

/** Thin divider between groups of rows. */
export const SettingDivider: React.FC = () => <div className="my-1.5 h-px bg-divider" />;

/** Indented container for settings revealed by an enabling toggle. */
export const SettingSubgroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="my-0.5 ml-0.5 border-l-2 border-divider pl-4">{children}</div>
);

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
}

/** Bare on/off toggle. The label lives in the parent SettingRow. */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, id }) => (
  <label className="relative inline-flex cursor-pointer items-center">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="peer sr-only"
    />
    <div className="peer h-6 w-11 rounded-full bg-divider after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-surface after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300" />
  </label>
);

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  label: string;
  onChange: (value: number) => void;
  /** Tighter footprint for compact surfaces like the timer popover. */
  compact?: boolean;
}

/** Compact -/+ numeric stepper used for timer durations. */
export const Stepper: React.FC<StepperProps> = ({
  value,
  min,
  max,
  step = 1,
  unit,
  label,
  onChange,
  compact = false,
}) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const btn = cn(
    'flex items-center justify-center rounded-full text-primary transition-colors hover:bg-border disabled:opacity-40 disabled:hover:bg-transparent',
    compact ? 'h-6 w-6' : 'h-7 w-7'
  );
  const icon = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-surface-variant p-[3px]">
      <button
        type="button"
        className={btn}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus className={icon} />
      </button>
      <span
        className={cn(
          'px-1 text-center font-semibold text-primary',
          compact ? 'min-w-[44px] text-xs' : 'min-w-[88px] text-sm'
        )}
      >
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-tertiary">{unit}</span>}
      </span>
      <button
        type="button"
        className={btn}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus className={icon} />
      </button>
    </div>
  );
};

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Segmented radio-group control for small sets of mutually exclusive options. */
export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="inline-flex gap-[2px] rounded-full border border-border bg-surface-variant p-[3px]">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-[5px] text-xs font-medium transition-colors',
              active
                ? 'bg-primary-600 font-semibold text-white'
                : 'text-secondary hover:text-primary'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface SelectControlProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** Styled native select used for longer option lists. */
export function SelectControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SelectControlProps<T>) {
  return (
    <select
      aria-label={label}
      value={value}
      // The select only holds option values of type T, so the DOM string is one.
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        'rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-primary-500',
        className
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
