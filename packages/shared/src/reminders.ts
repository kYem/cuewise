import {
  DEFAULT_REMINDER_ACTIVE_HOURS,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  REMINDER_INTERVAL_MAX,
  REMINDER_INTERVAL_MIN,
  REMINDER_SNOOZE_MINUTES,
} from './constants';
import { formatDateString } from './date-utils';
import type { Reminder, ReminderActiveHours, ReminderFrequency } from './types';

/**
 * Clamp a user-supplied interval to a whole number of minutes within range.
 * NaN falls back to the default; ±Infinity clamps to the [min, max] bounds.
 */
export function clampIntervalMinutes(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_REMINDER_INTERVAL_MINUTES;
  }
  const floored = Math.floor(value);
  if (!(floored >= REMINDER_INTERVAL_MIN)) {
    return REMINDER_INTERVAL_MIN; // catches -Infinity and sub-min values
  }
  if (floored > REMINDER_INTERVAL_MAX) {
    return REMINDER_INTERVAL_MAX; // catches +Infinity and over-max values
  }
  return floored;
}

/** Ultra-compact interval label: "30m", "1h", "1h 30m". */
export function formatCompactInterval(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/** A Date `minutes` from now — the fire-time anchor for interval cadences — moved into its window. */
export function intervalDueDateFromNow(minutes: number, activeHours?: ReminderActiveHours): Date {
  return fitToActiveHours(new Date(Date.now() + minutes * 60_000), activeHours);
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Length of the window in minutes; an end at or before the start runs past midnight. */
function activeSpanMinutes(activeHours: ReminderActiveHours): number {
  const span = minutesOfDay(activeHours.end) - minutesOfDay(activeHours.start);
  return span > 0 ? span : span + 24 * 60;
}

export function isActiveDay(day: Date, activeHours: ReminderActiveHours | undefined): boolean {
  const days = activeHours?.days;
  if (days === undefined || days.length === 0) {
    return true;
  }
  return days.includes(day.getDay());
}

// The most of a fire's own lateness that may carry its successor past the window's close.
const ACTIVE_HOURS_LATENESS_CAP_MS = 5 * 60_000;

/**
 * `candidate` if it falls inside an active window (both ends included, the close extended by
 * `lateToleranceMs`), else the next window's opening. Nine windows are searched from the day before.
 */
export function fitToActiveHours(
  candidate: Date,
  activeHours?: ReminderActiveHours,
  lateToleranceMs = 0
): Date {
  if (activeHours === undefined) {
    return candidate;
  }
  const startMinutes = minutesOfDay(activeHours.start);
  const span = activeSpanMinutes(activeHours);
  for (let offset = -1; offset <= 7; offset += 1) {
    const day = new Date(
      candidate.getFullYear(),
      candidate.getMonth(),
      candidate.getDate() + offset
    );
    if (!isActiveDay(day, activeHours)) {
      continue;
    }
    const open = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, startMinutes);
    const close = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      0,
      startMinutes + span
    );
    if (candidate >= open && candidate.getTime() <= close.getTime() + lateToleranceMs) {
      return candidate;
    }
    if (open > candidate) {
      return open;
    }
  }
  // Only a day list naming no weekday, or an unparseable time, gets here: firing beats never firing.
  return candidate;
}

/** How many fires an interval lands inside one window, counting its opening once. */
export function firesPerActiveDay(
  intervalMinutes: number,
  activeHours: ReminderActiveHours
): number {
  const span = activeSpanMinutes(activeHours);
  const fits = Math.floor(span / clampIntervalMinutes(intervalMinutes));
  // A whole-day window's close is the next opening, so it is not a fire of its own.
  return span === 24 * 60 ? fits : fits + 1;
}

/** Advance a Date by one calendar cadence in place (daily / weekly / monthly). */
function advanceCalendarDate(date: Date, frequency: ReminderFrequency | undefined): void {
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setDate(date.getDate() + 1); // daily / default
  }
}

// Namespaces a reminder's scheduler/notification id so the background worker can
// tell reminder alarms apart from any other scheduled wake.
const REMINDER_ALARM_PREFIX = 'reminder-';

/** The scheduler/notification id for a reminder's alarm. */
export function reminderAlarmId(reminderId: string): string {
  return `${REMINDER_ALARM_PREFIX}${reminderId}`;
}

/** The reminder id behind an alarm id, or null when it is not a reminder alarm. */
export function reminderIdFromAlarm(alarmId: string): string | null {
  if (!alarmId.startsWith(REMINDER_ALARM_PREFIX)) {
    return null;
  }
  return alarmId.slice(REMINDER_ALARM_PREFIX.length);
}

/**
 * Next due date strictly after `now` for a recurring reminder.
 * 'interval' anchors to fire-time (now + intervalMinutes); the calendar
 * frequencies advance from the stored dueDate until they land in the future.
 */
export function nextReminderDueDate(reminder: Reminder, now: Date): Date {
  const recurring = reminder.recurring;
  if (recurring?.frequency === 'interval' && isDailyTargetMet(reminder, now)) {
    return afterTodaysTarget(reminder, now);
  }
  if (recurring?.frequency === 'interval') {
    const minutes = clampIntervalMinutes(recurring.intervalMinutes);
    // A late fire pushes its successor late too; only that lateness may run past the close.
    const lateness = now.getTime() - new Date(reminder.dueDate).getTime();
    const tolerance = Number.isFinite(lateness)
      ? Math.min(ACTIVE_HOURS_LATENESS_CAP_MS, Math.max(0, lateness))
      : 0;
    return fitToActiveHours(
      new Date(now.getTime() + minutes * 60_000),
      recurring.activeHours,
      tolerance
    );
  }

  const frequency = recurring?.frequency;
  const next = new Date(reminder.dueDate);
  while (next <= now) {
    advanceCalendarDate(next, frequency);
  }
  return next;
}

/**
 * Next due date when the user checks off an UPCOMING (not-yet-fired) recurring
 * occurrence early — skip it and move to the one after, anchored to the scheduled
 * dueDate (not `now`). Calendar cadences keep their clock time (tonight 9pm →
 * tomorrow 9pm); interval adds one cadence.
 */
export function skipReminderOccurrence(reminder: Reminder, now: Date = new Date()): Date {
  const recurring = reminder.recurring;
  const next = new Date(reminder.dueDate);
  if (recurring?.frequency === 'interval' && isDailyTargetMet(reminder, now)) {
    return afterTodaysTarget(reminder, now);
  }
  if (recurring?.frequency === 'interval') {
    const minutes = clampIntervalMinutes(recurring.intervalMinutes);
    next.setTime(next.getTime() + minutes * 60_000);
    return fitToActiveHours(next, recurring.activeHours);
  }
  advanceCalendarDate(next, recurring?.frequency);
  return next;
}

export function dailyTargetOf(reminder: Reminder): number | undefined {
  const recurring = reminder.recurring;
  if (recurring?.frequency !== 'interval' || recurring.dailyTarget === undefined) {
    return undefined;
  }
  return recurring.dailyTarget >= 1 ? recurring.dailyTarget : undefined;
}

/**
 * The day a daily target counts toward: the date the current window opened. The small hours of a
 * window that crosses midnight still belong to the evening before.
 */
export function targetDayOf(reminder: Reminder, now: Date): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recurring = reminder.recurring;
  if (recurring?.frequency !== 'interval' || recurring.activeHours === undefined) {
    return today;
  }
  const start = minutesOfDay(recurring.activeHours.start);
  const end = minutesOfDay(recurring.activeHours.end);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (end <= start && nowMinutes < end) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  }
  return today;
}

/** How many times the reminder was marked done today; a count from an earlier day is zero. */
export function doneCountToday(reminder: Reminder, now: Date): number {
  const done = reminder.doneToday;
  if (done === undefined || done.date !== formatDateString(targetDayOf(reminder, now))) {
    return 0;
  }
  return done.count;
}

export function isDailyTargetMet(reminder: Reminder, now: Date): boolean {
  const target = dailyTargetOf(reminder);
  return target !== undefined && doneCountToday(reminder, now) >= target;
}

/** `1/3` toward today's target, or `✓ 4` once met, since Dones past it still count. */
export function formatDailyProgress(reminder: Reminder, now: Date): string | undefined {
  const target = dailyTargetOf(reminder);
  if (target === undefined) {
    return undefined;
  }
  const done = doneCountToday(reminder, now);
  if (done >= target) {
    return `✓ ${done}`;
  }
  return `${done}/${target}`;
}

/** Spoken form of `formatDailyProgress`: a screen reader may read `1/3` as a fraction or date. */
export function describeDailyProgress(reminder: Reminder, now: Date): string | undefined {
  const target = dailyTargetOf(reminder);
  if (target === undefined) {
    return undefined;
  }
  return `${doneCountToday(reminder, now)} of ${target} done today`;
}

/** One more done toward today's target; a reminder with no target is returned as is. */
export function recordReminderDone(reminder: Reminder, now: Date): Reminder {
  if (dailyTargetOf(reminder) === undefined) {
    return reminder;
  }
  const count = doneCountToday(reminder, now) + 1;
  return { ...reminder, doneToday: { date: formatDateString(targetDayOf(reminder, now)), count } };
}

/** The opening of the window after the one the target was met in. */
function afterTodaysTarget(reminder: Reminder, now: Date): Date {
  const recurring = reminder.recurring;
  const window =
    recurring?.frequency === 'interval' && recurring.activeHours !== undefined
      ? recurring.activeHours
      : DEFAULT_REMINDER_ACTIVE_HOURS;
  const day = targetDayOf(reminder, now);
  const next = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + 1,
    0,
    minutesOfDay(window.start)
  );
  return fitToActiveHours(next, window);
}

/**
 * True when checking off this reminder would SKIP an upcoming occurrence
 * (recurring + not yet fired) rather than complete/restart it. Drives both the
 * store's skip-vs-restart branch and the check control's skip affordance, so the
 * icon can never disagree with the action.
 */
export function isUpcomingRecurringOccurrence(reminder: Reminder, now: Date): boolean {
  if (!reminder.recurring || reminder.completed) {
    return false;
  }
  return new Date(reminder.dueDate).getTime() > now.getTime();
}

/**
 * Build a reminder's `recurring` payload from form state.
 * Interval cadences carry `intervalMinutes`; calendar cadences are frequency-only;
 * a non-recurring reminder is `undefined`. Pass an already-clamped interval.
 */
export function buildReminderRecurring(
  isRecurring: boolean,
  frequency: ReminderFrequency,
  clampedIntervalMinutes: number,
  activeHours?: ReminderActiveHours,
  dailyTarget?: number
): Reminder['recurring'] {
  if (!isRecurring) {
    return undefined;
  }
  if (frequency === 'interval') {
    const recurring: Reminder['recurring'] = { frequency, intervalMinutes: clampedIntervalMinutes };
    if (activeHours !== undefined) {
      recurring.activeHours = activeHours;
    }
    if (dailyTarget !== undefined) {
      recurring.dailyTarget = dailyTarget;
    }
    return recurring;
  }
  return { frequency };
}

/**
 * Human-readable cadence label for a recurring reminder.
 * 'interval' renders as "every N min"; calendar frequencies pass through.
 */
export function formatReminderCadence(recurring: NonNullable<Reminder['recurring']>): string {
  if (recurring.frequency === 'interval') {
    return `every ${clampIntervalMinutes(recurring.intervalMinutes)} min`;
  }
  return recurring.frequency;
}

export type ReminderNotificationAction =
  | { type: 'complete' }
  | { type: 'count' }
  | { type: 'snooze'; dueDate: string }
  | { type: 'dismiss' };

/**
 * Decide what a notification button does, free of chrome.* side effects so it's
 * unit-testable. buttonIndex 0 = Done, 1 = Snooze. `now` is the current time.
 */
export function resolveReminderNotificationAction(
  reminder: Reminder | undefined,
  buttonIndex: number,
  now: Date,
  snoozeMinutes = REMINDER_SNOOZE_MINUTES
): ReminderNotificationAction {
  if (!reminder) {
    return { type: 'dismiss' };
  }
  if (buttonIndex === 0) {
    // Done: complete one-offs and count active habits; calendar cadences and paused ones dismiss.
    if (!reminder.recurring) {
      return { type: 'complete' };
    }
    // Every active habit counts, target or not, so its day lands in the habit history.
    if (reminder.recurring.frequency === 'interval' && !reminder.paused) {
      return { type: 'count' };
    }
    return { type: 'dismiss' };
  }
  if (buttonIndex === 1) {
    // Snooze: never resurrect a paused recurring reminder.
    if (reminder.recurring && reminder.paused) {
      return { type: 'dismiss' };
    }
    return {
      type: 'snooze',
      dueDate: new Date(now.getTime() + snoozeMinutes * 60_000).toISOString(),
    };
  }
  return { type: 'dismiss' };
}
