import { cn } from '@cuewise/ui';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface EditableValueProps {
  value: number;
  unit: string;
  presets?: number[];
  onChange: (value: number) => void;
  className?: string;
  // Compact trigger: render `${value}${suffix}` (e.g. "25m", or just "4" with no
  // suffix) instead of `${value} ${unit}`. Options still show the full `${preset} ${unit}`.
  compact?: boolean;
  suffix?: string;
  // 'onGlass' uses white text for legibility over the photo/frosted backgrounds.
  tone?: 'primary' | 'onGlass';
}

export const EditableValue: React.FC<EditableValueProps> = ({
  value,
  unit,
  presets,
  onChange,
  className = '',
  compact = false,
  suffix = '',
  tone = 'primary',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close the preset menu when clicking outside it
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const triggerLabel = compact ? `${value}${suffix}` : `${value} ${unit}`;
  const toneClasses =
    tone === 'onGlass'
      ? 'text-white/90 hover:text-white'
      : 'text-primary-600 hover:text-primary-700';

  const handleToggle = () => {
    if (presets) {
      setOpen((o) => !o);
    }
  };

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'cursor-pointer font-semibold underline decoration-dotted underline-offset-2 transition-colors',
          toneClasses,
          className
        )}
        title="Click to edit"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerLabel}
      </button>
      {/* Opens above the trigger — the settings row sits at the bottom of the card. */}
      {open && presets && (
        <span
          role="listbox"
          className="absolute bottom-[calc(100%+6px)] left-1/2 z-30 flex min-w-[92px] -translate-x-1/2 flex-col rounded-lg border border-white/15 bg-black/70 p-1 shadow-xl backdrop-blur-md"
        >
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              role="option"
              aria-selected={preset === value}
              onClick={() => {
                onChange(preset);
                setOpen(false);
              }}
              className={cn(
                'whitespace-nowrap rounded px-2.5 py-1.5 text-left text-xs text-white transition-colors hover:bg-white/15',
                preset === value && 'bg-white/15'
              )}
            >
              {preset} {unit}
            </button>
          ))}
        </span>
      )}
    </span>
  );
};
