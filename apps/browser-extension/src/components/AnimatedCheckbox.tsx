import { cn } from '@cuewise/ui';
import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../utils/prefers-reduced-motion';

type CheckboxSize = 'sm' | 'md' | 'lg' | 'xl';
type CheckboxTone = 'default' | 'onImage';
type CheckboxPhase = 'idle' | 'spin' | 'draw';

const SIZE_PX: Record<CheckboxSize, number> = { sm: 16, md: 20, lg: 24, xl: 40 };

// On = completed color, off = resting color (brightens on row hover via `group`).
// `off` uses text-secondary (not tertiary) so the resting ring sits close in
// visual weight to the completed ring rather than reading as a thinner outline.
const TONE_COLOR: Record<CheckboxTone, { on: string; off: string }> = {
  default: { on: 'text-primary-600', off: 'text-secondary group-hover:text-primary-500' },
  onImage: { on: 'text-white', off: 'text-white/80 group-hover:text-white' },
};

interface AnimatedCheckboxProps {
  checked: boolean;
  size?: CheckboxSize;
  tone?: CheckboxTone;
  className?: string;
}

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Presentational spinner-to-check visual. Renders aria-hidden — the wrapping
 * button owns the click handler and aria-label. On a real false->true toggle it
 * spins the ring once, then the check strokes on; mounting checked, unchecking,
 * and reduced-motion stay static (no spin). pathLength={16} normalizes the check
 * geometry so the draw keyframe (dashoffset 16 -> 0) works regardless of size.
 */
export function AnimatedCheckbox({
  checked,
  size = 'md',
  tone = 'default',
  className,
}: AnimatedCheckboxProps) {
  const reduced = prefersReducedMotion();
  const prevChecked = useRef(checked);
  const [phase, setPhase] = useState<CheckboxPhase>('idle');

  useEffect(() => {
    const wasChecked = prevChecked.current;
    prevChecked.current = checked;

    if (checked && !wasChecked && !reduced) {
      setPhase('spin');
      // Keep in sync with .animate-checkbox-* in index.css: 280 ≈ spin (0.3s),
      // 720 = draw start + draw (0.42s) + a small buffer.
      const toDraw = window.setTimeout(() => setPhase('draw'), 280);
      const toIdle = window.setTimeout(() => setPhase('idle'), 720);
      return () => {
        window.clearTimeout(toDraw);
        window.clearTimeout(toIdle);
      };
    }

    if (!checked) {
      setPhase('idle');
    }
  }, [checked, reduced]);

  const px = SIZE_PX[size];
  const color = TONE_COLOR[tone];
  const showSpinner = phase === 'spin';
  const showRing = phase !== 'spin';
  const showCheck = checked && phase !== 'spin';
  const drawing = phase === 'draw';

  return (
    <span
      data-testid="animated-checkbox"
      data-state={checked ? 'checked' : 'unchecked'}
      data-phase={phase}
      aria-hidden="true"
      className={cn(
        'inline-flex transition-colors',
        checked ? color.on : color.off,
        tone === 'onImage' && 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]',
        className
      )}
      style={{ width: px, height: px }}
    >
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        fill="none"
        aria-hidden="true"
        className={cn('overflow-visible', phase !== 'idle' && 'animate-checkbox-pop')}
      >
        {showRing && (
          <circle cx="12" cy="12" r={RING_RADIUS} stroke="currentColor" strokeWidth="2" />
        )}
        {showSpinner && (
          <g className="animate-checkbox-spin">
            <circle
              cx="12"
              cy="12"
              r={RING_RADIUS}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE * 0.6} ${RING_CIRCUMFERENCE}`}
            />
          </g>
        )}
        {showCheck && (
          <path
            d="M7 12.5l3.3 3.4L17 8.7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={16}
            strokeDasharray="16"
            strokeDashoffset={drawing ? 16 : 0}
            className={drawing ? 'animate-checkbox-draw' : undefined}
          />
        )}
      </svg>
    </span>
  );
}
