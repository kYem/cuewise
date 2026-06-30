import type { Settings } from '@cuewise/shared';
import { Popover, PopoverAnchor, PopoverContent } from '@cuewise/ui';
import { Bed, Coffee, type LucideIcon, Repeat, Timer } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { EditableValue } from './EditableValue';
import { PresetGrid } from './settings/PresetGrid';

type FieldKey = 'work' | 'break' | 'long' | 'interval';

interface RhythmField {
  key: FieldKey;
  title: string;
  label: string;
  icon: LucideIcon;
  setting:
    | 'pomodoroWorkDuration'
    | 'pomodoroBreakDuration'
    | 'pomodoroLongBreakDuration'
    | 'pomodoroLongBreakInterval';
  unit: string;
  suffix: string;
  presets: number[];
}

const FIELDS: RhythmField[] = [
  {
    key: 'work',
    title: 'Focus duration',
    label: 'Focus',
    icon: Timer,
    setting: 'pomodoroWorkDuration',
    unit: 'minutes',
    suffix: 'm',
    presets: [15, 20, 25, 30, 45, 60],
  },
  {
    key: 'break',
    title: 'Break length',
    label: 'Break',
    icon: Coffee,
    setting: 'pomodoroBreakDuration',
    unit: 'minutes',
    suffix: 'm',
    presets: [3, 5, 10, 15],
  },
  {
    key: 'long',
    title: 'Long break length',
    label: 'Long break',
    icon: Bed,
    setting: 'pomodoroLongBreakDuration',
    unit: 'minutes',
    suffix: 'm',
    presets: [15, 20, 25, 30],
  },
  {
    key: 'interval',
    title: 'Long break interval',
    label: 'Interval',
    icon: Repeat,
    setting: 'pomodoroLongBreakInterval',
    unit: 'sessions',
    suffix: '',
    presets: [2, 3, 4, 5, 6, 8],
  },
];

interface PomodoroMiniSettingsProps {
  settings: Settings;
  onApply: (patch: Partial<Settings>) => void | Promise<void>;
}

/** Tap any timer value to open a shared popover with rhythm presets + per-field editing. */
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
      <PopoverContent align="center" className="w-[280px] space-y-3 p-3">
        <PresetGrid s={settings} onApply={onApply} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {FIELDS.map((f) => {
            const Icon = f.icon;
            const value = settings[f.setting];
            return (
              <div
                key={f.key}
                className={
                  focused === f.key
                    ? 'flex items-center justify-between rounded-md bg-primary-50 px-2 py-1'
                    : 'flex items-center justify-between px-2 py-1'
                }
              >
                <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
                  <Icon className="h-3.5 w-3.5" />
                  {f.label}
                </span>
                <EditableValue
                  value={value}
                  unit={f.unit}
                  compact
                  suffix={f.suffix}
                  presets={f.presets}
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
