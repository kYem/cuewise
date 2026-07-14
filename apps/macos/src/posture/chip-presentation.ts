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

export interface ChipSurface {
  hash: string;
  focusModeActive: boolean;
  reminderPanelPinned: boolean;
  showThemeSwitcher: boolean;
}

/**
 * Positional classes for the corner cluster (pure, so placement is testable).
 * Default is above the reminder bell, mirroring its theme-switcher shift.
 */
export function chipPlacement(surface: ChipSurface): string {
  if (surface.focusModeActive) {
    // The focus overlay is a body portal at z-50 — the chip must outrank it.
    return 'bottom-[4.75rem] right-4 z-[60]';
  }
  const onPomodoro = surface.hash.replace(/^#/, '') === 'pomodoro';
  if (surface.reminderPanelPinned && !onPomodoro) {
    // A pinned (sticky) reminder panel expands into the above-the-bell slot on
    // home — sit beside the bell (48px wide at right-4) instead, mid-aligned.
    return surface.showThemeSwitcher
      ? 'bottom-[1.5625rem] right-[396px] z-30'
      : 'bottom-[1.5625rem] right-[4.5rem] z-30';
  }
  return surface.showThemeSwitcher
    ? 'bottom-[4.75rem] right-[340px] z-30'
    : 'bottom-[4.75rem] right-4 z-30';
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
