import { describePauseEnd, isWithinQuietHours, type PostureState } from './posture-controller';
import { STATUS_META } from './status-meta';

export interface ChipPresentation {
  dot: string;
  label: string;
}

// Full-page surfaces where the floating chip would sit on top of content. A
// deny-list, not an allow-list: modal-only hashes (e.g. the #settings deep
// link, cleared via replaceState with no hashchange) must behave like home.
const CHIP_HIDDEN_PAGES = new Set(['insights', 'quotes', 'goals', 'concepts']);

/** The chip belongs on home, pomodoro, and the focus-mode overlay only. */
export function chipVisibleOnSurface(hash: string, focusModeActive: boolean): boolean {
  if (focusModeActive) {
    return true;
  }
  return !CHIP_HIDDEN_PAGES.has(hash.replace(/^#/, ''));
}

// Precedence mirrors the tray (the authoritative surface): error > glow
// unavailable > paused > quiet hours > steady status > starting. Null while not
// tracking. Sample frames re-render every ~2s, so the label can't go stale long.
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
