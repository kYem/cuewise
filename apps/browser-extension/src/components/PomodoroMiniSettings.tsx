import type { Settings } from '@cuewise/shared';
import { cn, Popover, PopoverAnchor, PopoverContent } from '@cuewise/ui';
import { Bed, Coffee, type LucideIcon, Repeat, Timer } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { PresetGrid } from './settings/PresetGrid';
import { Stepper } from './settings/SettingControls';

type FieldKey = 'work' | 'break' | 'long' | 'interval';

interface RhythmField {
  key: FieldKey;
  title: string;
  label: string;
  icon: LucideIcon;
  // One of the four number-valued rhythm keys; its number-ness is enforced by the
  // `settings[setting]` → Stepper `value` read below, not by the onApply write.
  setting:
    | 'pomodoroWorkDuration'
    | 'pomodoroBreakDuration'
    | 'pomodoroLongBreakDuration'
    | 'pomodoroLongBreakInterval';
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Compact glance suffix on the trigger row ("25m" vs "4"). */
  suffix: string;
}

const FIELDS: readonly RhythmField[] = [
  {
    key: 'work',
    title: 'Focus duration',
    label: 'Focus',
    icon: Timer,
    setting: 'pomodoroWorkDuration',
    min: 1,
    max: 60,
    step: 5,
    unit: 'min',
    suffix: 'm',
  },
  {
    key: 'break',
    title: 'Break length',
    label: 'Break',
    icon: Coffee,
    setting: 'pomodoroBreakDuration',
    min: 1,
    max: 30,
    step: 1,
    unit: 'min',
    suffix: 'm',
  },
  {
    key: 'long',
    title: 'Long break length',
    label: 'Long break',
    icon: Bed,
    setting: 'pomodoroLongBreakDuration',
    min: 10,
    max: 60,
    step: 5,
    unit: 'min',
    suffix: 'm',
  },
  {
    key: 'interval',
    title: 'Long break interval',
    label: 'Interval',
    icon: Repeat,
    setting: 'pomodoroLongBreakInterval',
    min: 2,
    max: 10,
    step: 1,
    unit: '',
    suffix: '',
  },
];

interface PomodoroMiniSettingsProps {
  settings: Settings;
  onApply: (patch: Partial<Settings>) => void | Promise<void>;
}

/** Tap any timer value to open a shared popover with rhythm presets + per-field steppers. */
export const PomodoroMiniSettings: React.FC<PomodoroMiniSettingsProps> = ({
  settings,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<FieldKey | null>(null);

  const openField = (key: FieldKey) => {
    setFocused(key);
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-white/60">
          {FIELDS.map((f) => {
            const Icon = f.icon;
            const value = settings[f.setting];
            return (
              <button
                key={f.key}
                type="button"
                title={f.title}
                aria-label={f.title}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => openField(f.key)}
                className="inline-flex items-center gap-1.5 transition-colors hover:text-white/90"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="font-semibold underline decoration-dotted underline-offset-2">
                  {value}
                  {f.suffix}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        className="w-[264px] space-y-2.5 border-border bg-surface-elevated p-2.5 shadow-2xl backdrop-blur-xl"
      >
        <PresetGrid s={settings} onApply={onApply} className="grid grid-cols-2 gap-1.5" compact />
        <div className="space-y-0.5">
          {FIELDS.map((f) => {
            const Icon = f.icon;
            const value = settings[f.setting];
            // Mirror Settings: focus steps by 5 from 20 up, by 1 below.
            const step = f.key === 'work' && value < 20 ? 1 : f.step;
            return (
              <div
                key={f.key}
                className={cn(
                  'flex items-center justify-between rounded-md px-1 py-0.5',
                  focused === f.key && 'bg-primary-50'
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
                  <Icon className="h-3.5 w-3.5" />
                  {f.label}
                </span>
                <Stepper
                  label={f.title}
                  value={value}
                  min={f.min}
                  max={f.max}
                  step={step}
                  unit={f.unit}
                  compact
                  onChange={(next) => onApply({ [f.setting]: next })}
                />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
