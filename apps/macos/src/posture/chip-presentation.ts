import { describePauseEnd, type PostureState } from './posture-controller';
import { STATUS_META } from './status-meta';

export interface ChipPresentation {
  dot: string;
  label: string;
}

// Precedence mirrors the tray (the authoritative surface): error > glow
// unavailable > paused > steady status > starting. Null while not tracking.
export function chipPresentation(posture: PostureState): ChipPresentation | null {
  if (!posture.tracking) {
    return null;
  }
  if (posture.error !== null) {
    return { dot: 'bg-amber-500', label: 'Readings unavailable' };
  }
  if (posture.nudgesEnabled && posture.glowUndeliverable) {
    return { dot: 'bg-amber-500', label: 'Glow unavailable' };
  }
  if (posture.nudgesEnabled && posture.nudgesPausedUntil !== null) {
    return {
      dot: 'bg-tertiary',
      label: `Nudges paused ${describePauseEnd(posture.nudgesPausedUntil)}`,
    };
  }
  if (posture.steadyStatus !== null) {
    const meta = STATUS_META[posture.steadyStatus];
    return { dot: meta.dot, label: meta.label };
  }
  return { dot: 'bg-tertiary', label: 'Starting…' };
}
