import { describePauseEnd, isWithinQuietHours, type PostureState } from './posture-controller';
import { STATUS_META } from './status-meta';

export interface ChipPresentation {
  dot: string;
  label: string;
}

// Precedence mirrors the tray (the authoritative surface): error > glow
// unavailable > paused > quiet hours > steady status > starting. Null while
// not tracking. `now` is injectable for tests; frames re-render every ~2s, so
// the quiet-hours label can't go stale for long.
export function chipPresentation(
  posture: PostureState,
  now: Date = new Date()
): ChipPresentation | null {
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
  if (posture.nudgesEnabled && isWithinQuietHours(posture.quietHours, now)) {
    return { dot: 'bg-tertiary', label: `Quiet hours until ${posture.quietHours.end}` };
  }
  if (posture.steadyStatus !== null) {
    const meta = STATUS_META[posture.steadyStatus];
    return { dot: meta.dot, label: meta.label };
  }
  return { dot: 'bg-tertiary', label: 'Starting…' };
}
