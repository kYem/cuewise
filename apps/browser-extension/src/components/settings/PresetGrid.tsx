import type { Settings } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check } from 'lucide-react';
import type React from 'react';

interface TimerPreset {
  id: string;
  name: string;
  work: number;
  short: number;
  long: number;
  after: number;
}

/** Session rhythm recipes (work · short break · long break, in minutes). */
const TIMER_PRESETS: TimerPreset[] = [
  { id: 'classic', name: 'Classic', work: 25, short: 5, long: 15, after: 4 },
  { id: 'deep', name: 'Deep work', work: 50, short: 10, long: 25, after: 2 },
  { id: 'sprint', name: 'Quick sprint', work: 15, short: 3, long: 12, after: 4 },
];

/** Human-readable "work · short · long" summary for a rhythm. */
function rhythm(work: number, short: number, long: number): string {
  return `${work} · ${short} · ${long}`;
}

function matchesPreset(s: Settings, p: TimerPreset): boolean {
  return (
    s.pomodoroWorkDuration === p.work &&
    s.pomodoroBreakDuration === p.short &&
    s.pomodoroLongBreakDuration === p.long &&
    s.pomodoroLongBreakInterval === p.after
  );
}

interface PresetGridProps {
  s: Settings;
  onApply: (patch: Partial<Settings>) => void;
}

/** Recipe cards that apply a full timer rhythm; flips to "Custom" once fine-tuned. */
export const PresetGrid: React.FC<PresetGridProps> = ({ s, onApply }) => {
  const activePreset = TIMER_PRESETS.find((p) => matchesPreset(s, p));
  const isCustom = !activePreset;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {TIMER_PRESETS.map((p) => {
        const active = activePreset?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              onApply({
                pomodoroWorkDuration: p.work,
                pomodoroBreakDuration: p.short,
                pomodoroLongBreakDuration: p.long,
                pomodoroLongBreakInterval: p.after,
              })
            }
            className={cn(
              'relative flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
              active
                ? 'border-primary-600 bg-primary-50'
                : 'border-border bg-surface hover:bg-surface-variant'
            )}
          >
            <span className="whitespace-nowrap text-sm font-semibold text-primary">{p.name}</span>
            <span className="whitespace-nowrap text-[11px] tracking-wide text-tertiary">
              {rhythm(p.work, p.short, p.long)}
            </span>
            {active && <PresetCheck />}
          </button>
        );
      })}
      <div
        className={cn(
          'relative flex flex-col items-start gap-0.5 rounded-xl border border-dashed p-3 text-left',
          isCustom ? 'border-primary-600 bg-primary-50' : 'border-border opacity-60'
        )}
      >
        <span className="whitespace-nowrap text-sm font-semibold text-primary">Custom</span>
        <span className="whitespace-nowrap text-[11px] tracking-wide text-tertiary">
          {rhythm(s.pomodoroWorkDuration, s.pomodoroBreakDuration, s.pomodoroLongBreakDuration)}
        </span>
        {isCustom && <PresetCheck />}
      </div>
    </div>
  );
};

const PresetCheck: React.FC = () => (
  <span className="absolute right-2 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary-600">
    <Check className="h-3 w-3 text-white" />
  </span>
);
