import type { Settings } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check } from 'lucide-react';
import type React from 'react';
import { applyPreset, matchesPreset, TIMER_PRESETS } from './timer-presets';

/** Human-readable "work · short · long" summary for a rhythm. */
function rhythm(work: number, short: number, long: number): string {
  return `${work} · ${short} · ${long}`;
}

interface PresetGridProps {
  s: Settings;
  onApply: (patch: Partial<Settings>) => void;
  /** Override the grid layout — e.g. a 2-up grid inside the narrow timer popover. */
  className?: string;
  /** Tighter chips for the compact timer popover. */
  compact?: boolean;
}

/** Recipe cards that apply a full timer rhythm; flips to "Custom" once fine-tuned. */
export const PresetGrid: React.FC<PresetGridProps> = ({
  s,
  onApply,
  className,
  compact = false,
}) => {
  const activePreset = TIMER_PRESETS.find((p) => matchesPreset(s, p));
  const isCustom = !activePreset;
  const cardBase = cn(
    'relative flex flex-col items-start gap-0.5 rounded-lg border text-left transition-colors',
    compact ? 'p-1.5' : 'rounded-xl p-3'
  );
  const nameClass = cn(
    'whitespace-nowrap font-semibold text-primary',
    compact ? 'text-xs' : 'text-sm'
  );
  const rhythmClass = cn(
    'whitespace-nowrap tracking-wide text-tertiary',
    compact ? 'text-[10px]' : 'text-[11px]'
  );

  return (
    <div className={className ?? 'grid grid-cols-2 gap-2.5 sm:grid-cols-4'}>
      {TIMER_PRESETS.map((p) => {
        const active = activePreset?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(applyPreset(p))}
            className={cn(
              cardBase,
              active
                ? 'border-primary-600 bg-primary-50'
                : 'border-border bg-surface hover:bg-surface-variant'
            )}
          >
            <span className={nameClass}>{p.name}</span>
            <span className={rhythmClass}>{rhythm(p.work, p.short, p.long)}</span>
            {active && <PresetCheck compact={compact} />}
          </button>
        );
      })}
      <div
        className={cn(
          cardBase,
          'border-dashed',
          isCustom ? 'border-primary-600 bg-primary-50' : 'border-border opacity-60'
        )}
      >
        <span className={nameClass}>Custom</span>
        <span className={rhythmClass}>
          {rhythm(s.pomodoroWorkDuration, s.pomodoroBreakDuration, s.pomodoroLongBreakDuration)}
        </span>
        {isCustom && <PresetCheck compact={compact} />}
      </div>
    </div>
  );
};

const PresetCheck: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <span
    className={cn(
      'absolute flex items-center justify-center rounded-full bg-primary-600',
      compact ? 'right-1 top-1 h-[14px] w-[14px]' : 'right-2 top-2 h-[18px] w-[18px]'
    )}
  >
    <Check className={compact ? 'h-2.5 w-2.5 text-white' : 'h-3 w-3 text-white'} />
  </span>
);
