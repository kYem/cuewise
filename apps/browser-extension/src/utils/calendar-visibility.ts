import type { NewTabCalendarPosition, PomodoroCompanion } from '@cuewise/shared';
import { isCalendarFeatureEnabled } from './google-calendar';

// Single source of truth for whether/where the calendar surfaces appear (and
// what the Pomodoro companion falls back to when it's off). Every resolver folds
// the build-time feature gate (isCalendarFeatureEnabled) into the user's
// setting, so a build shipped without an OAuth client id — or a stale
// 'calendar' setting synced from a provisioned profile — can never surface the
// calendar. `featureEnabled` defaults to the live gate; pass it explicitly in
// tests, or to share one gate read across resolvers.

interface NewTabCalendar {
  show: boolean;
  position: NewTabCalendarPosition;
}

// The Pomodoro companion falls back to 'quote' whenever the calendar is off, so
// 'calendar'/'both' never render the strip on an unprovisioned build.
export function resolvePomodoroCompanion(
  setting: PomodoroCompanion,
  featureEnabled: boolean = isCalendarFeatureEnabled()
): PomodoroCompanion {
  return featureEnabled ? setting : 'quote';
}

// The new-tab strip shows only when the feature is on AND the user enabled it;
// position is passed through unchanged for when it does show.
export function resolveNewTabCalendar(
  settings: { newTabShowCalendar: boolean; newTabCalendarPosition: NewTabCalendarPosition },
  featureEnabled: boolean = isCalendarFeatureEnabled()
): NewTabCalendar {
  return {
    show: featureEnabled && settings.newTabShowCalendar,
    position: settings.newTabCalendarPosition,
  };
}
