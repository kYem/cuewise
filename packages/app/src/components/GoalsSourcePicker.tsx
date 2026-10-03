import type { GoalsSource } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Check, ChevronDown, Target } from 'lucide-react';
import type React from 'react';
import { useId, useState } from 'react';
import { NotionLogo } from './NotionLogo';

type SourceIcon = React.ComponentType<{ className?: string }>;

const GOALS_SOURCES: { value: GoalsSource; label: string; icon: SourceIcon }[] = [
  { value: 'cuewise', label: 'My goals', icon: Target },
  { value: 'notion', label: 'Notion', icon: NotionLogo },
];

export function goalsSourceIcon(source: GoalsSource): SourceIcon {
  return (GOALS_SOURCES.find(({ value }) => value === source) ?? GOALS_SOURCES[0]).icon;
}

interface GoalsSourcePickerProps {
  source: GoalsSource;
  onChange: (source: GoalsSource) => void;
  triggerClassName?: string;
}

/** One fixed-width button whatever the number of sources, so each integration adds a menu row. */
export function GoalsSourcePicker({
  source,
  onChange,
  triggerClassName,
}: GoalsSourcePickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const current = GOALS_SOURCES.find(({ value }) => value === source) ?? GOALS_SOURCES[0];
  const CurrentIcon = current.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={`Tasks from ${current.label}`}
          title={`Tasks from ${current.label}`}
          className={cn(
            'h-8 flex flex-shrink-0 items-center gap-1 px-2 rounded-lg bg-surface-variant/80 hover:bg-surface-variant backdrop-blur-sm text-secondary hover:text-primary transition-all border border-border',
            triggerClassName
          )}
        >
          <CurrentIcon className="w-4 h-4" />
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 bg-surface/95 backdrop-blur-xl" align="end">
        <div id={labelId} className="text-xs font-medium text-tertiary px-2 py-1">
          Show tasks from
        </div>
        <div role="menu" aria-labelledby={labelId} className="space-y-0.5">
          {GOALS_SOURCES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={source === value}
              onClick={() => {
                onChange(value);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                source === value
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-primary hover:bg-surface-variant'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {source === value && <Check className="w-4 h-4 ml-auto" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
