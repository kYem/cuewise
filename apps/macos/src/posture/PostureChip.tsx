import { cn } from '@cuewise/ui';
import type React from 'react';
import { describePauseEnd, usePosture } from './posture-controller';
import { STATUS_META } from './status-meta';

/**
 * Ambient posture status on the main webview while tracking is on: the steady
 * (debounced) status dot + label, with paused/degraded states taking precedence.
 */
export function PostureChip(): React.JSX.Element | null {
  const posture = usePosture();
  if (!posture.tracking) {
    return null;
  }

  let dot = 'bg-tertiary';
  let label = 'Starting…';
  if (posture.glowUndeliverable && posture.nudgesEnabled) {
    dot = 'bg-amber-500';
    label = 'Glow unavailable';
  } else if (posture.nudgesEnabled && posture.nudgesPausedUntil !== null) {
    dot = 'bg-tertiary';
    label = `Nudges paused ${describePauseEnd(posture.nudgesPausedUntil)}`;
  } else if (posture.steadyStatus !== null) {
    const meta = STATUS_META[posture.steadyStatus];
    dot = meta.dot;
    label = meta.label;
  }

  return (
    <output
      className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-secondary shadow-sm backdrop-blur"
      aria-label={`Posture: ${label}`}
    >
      <span className={cn('h-2 w-2 rounded-full', dot)} />
      {label}
    </output>
  );
}
