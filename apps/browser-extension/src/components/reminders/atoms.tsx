import {
  formatReminderCadence,
  isUpcomingRecurringOccurrence,
  REMINDER_CATEGORY_META,
  type Reminder,
  type ReminderPanelLayout,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import {
  AlarmClock,
  AlertCircle,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  LayoutList,
  Pause,
  Play,
  Repeat,
  SkipForward,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import emptyRemindersAnimation from '../../assets/lottie/empty/reminders.json';
import { useSettingsStore } from '../../stores/settings-store';
import type { ReminderState } from '../../utils/reminder-classify';
import { formatCountdown, formatDueDate, formatTimeAgo } from '../../utils/reminder-date-utils';
import { EmptyState } from '../EmptyState';
import { REMINDER_CATEGORY_ICON, REMINDER_STATE_STYLES } from './reminder-state-styles';

/** States that warrant the loud accent treatment (and a live countdown). */
function isUrgentState(state: ReminderState): boolean {
  return state === 'soon' || state === 'overdue' || state === 'notified';
}

interface ReminderCategoryCheckProps {
  reminder: Reminder;
  state: ReminderState;
  onToggle: () => void;
  size?: number;
}

/**
 * Round control that doubles as info + tap target: shows the category icon
 * (tinted by category color when idle, state accent when urgent) and flips to a
 * check on hover or when completed. Ported from the design `CatCheck`.
 */
export function ReminderCategoryCheck({
  reminder,
  state,
  onToggle,
  size = 24,
}: ReminderCategoryCheckProps) {
  const [hover, setHover] = useState(false);
  const completed = reminder.completed;
  const urgent = isUrgentState(state);
  const styles = REMINDER_STATE_STYLES[state];
  const category = reminder.category ?? 'productivity';
  const categoryColor = REMINDER_CATEGORY_META[category].color;
  const CategoryIcon = REMINDER_CATEGORY_ICON[category];

  // Accent: state color when urgent, otherwise the category hue.
  const accentColor = urgent || completed ? undefined : categoryColor;
  // Clicking a not-yet-due recurring occurrence skips it rather than completing —
  // surface a skip glyph + label on hover so the affordance matches the action.
  const skipping = isUpcomingRecurringOccurrence(reminder, new Date());
  const showActionIcon = completed || hover;
  const ActionIcon = skipping ? SkipForward : Check;
  let actionLabel = 'Mark done';
  if (completed) {
    actionLabel = 'Mark not done';
  } else if (skipping) {
    actionLabel = 'Skip to next occurrence';
  }
  const iconSize = Math.round(size * 0.5);

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={actionLabel}
      title={actionLabel}
      className={cn(
        'flex-none inline-flex items-center justify-center rounded-full border-2 transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
        urgent || completed ? cn(styles.text, styles.border) : 'border-current'
      )}
      style={{
        width: size,
        height: size,
        color: accentColor,
        borderColor: accentColor,
      }}
    >
      {showActionIcon ? (
        <ActionIcon style={{ width: iconSize, height: iconSize }} strokeWidth={3} />
      ) : (
        <CategoryIcon style={{ width: iconSize, height: iconSize }} strokeWidth={2.5} />
      )}
    </button>
  );
}

interface RecurrencePauseControlProps {
  reminder: Reminder;
  onPauseToggle: (id: string, paused: boolean) => void;
}

/**
 * Recurrence cadence label + pause/resume toggle. Renders nothing for
 * non-recurring reminders. Mirrors the inline block in ReminderItem.
 */
export function RecurrencePauseControl({ reminder, onPauseToggle }: RecurrencePauseControlProps) {
  const recurring = reminder.recurring;
  if (!recurring) {
    return null;
  }
  const paused = reminder.paused === true;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs first-letter:uppercase',
          paused ? 'text-tertiary' : 'text-primary-600'
        )}
      >
        <Repeat className="w-3 h-3" />
        {formatReminderCadence(recurring)}
        {paused ? ' · paused' : ''}
      </span>
      <button
        type="button"
        onClick={() => onPauseToggle(reminder.id, !paused)}
        className={cn(
          'p-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          paused ? 'text-tertiary hover:text-primary-500' : 'text-secondary hover:text-primary-500'
        )}
        aria-label={paused ? 'Resume reminder' : 'Pause reminder'}
        title={paused ? 'Resume' : 'Pause'}
      >
        {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

interface ReminderSnoozeRowProps {
  onSnooze: (minutes: number) => void;
  state?: ReminderState;
}

const SNOOZE_OPTIONS = [5, 15, 30] as const;

/** "Snooze" label + 5/15/30m buttons, tinted by the state accent. */
export function ReminderSnoozeRow({ onSnooze, state = 'soon' }: ReminderSnoozeRowProps) {
  const styles = REMINDER_STATE_STYLES[state];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1 text-xs text-secondary">
        <AlarmClock className="w-3.5 h-3.5" />
        Snooze
      </span>
      {SNOOZE_OPTIONS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          onClick={() => onSnooze(minutes)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-semibold border transition hover:brightness-110',
            styles.chip.bg,
            styles.chip.text,
            styles.chip.border
          )}
        >
          {minutes}m
        </button>
      ))}
    </div>
  );
}

interface LayoutSwitchProps {
  layout: ReminderPanelLayout;
  onLayoutChange: (layout: ReminderPanelLayout) => void;
}

/** Compact 2-button segmented pill to flip the panel layout in place. */
function LayoutSwitch({ layout, onLayoutChange }: LayoutSwitchProps) {
  return (
    <div className="flex-none inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-variant p-0.5">
      <button
        type="button"
        onClick={() => onLayoutChange('composed')}
        aria-label="Composed view"
        title="Composed view"
        className={cn(
          'p-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          layout === 'composed'
            ? 'bg-surface text-primary-600 shadow-sm'
            : 'text-tertiary hover:text-primary'
        )}
      >
        <LayoutList className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onLayoutChange('agenda')}
        aria-label="Agenda view"
        title="Agenda view"
        className={cn(
          'p-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          layout === 'agenda'
            ? 'bg-surface text-primary-600 shadow-sm'
            : 'text-tertiary hover:text-primary'
        )}
      >
        <CalendarClock className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ReminderPanelHeaderProps {
  count: number;
  hasUrgent: boolean;
  subNote?: { text: string; tone?: ReminderState };
  layout?: ReminderPanelLayout;
  onLayoutChange?: (layout: ReminderPanelLayout) => void;
}

/** Panel header: bell tile (red when urgent), title + count, optional sub-note and layout switcher. */
export function ReminderPanelHeader({
  count,
  hasUrgent,
  subNote,
  layout,
  onLayoutChange,
}: ReminderPanelHeaderProps) {
  const noteTone = subNote?.tone ? REMINDER_STATE_STYLES[subNote.tone].text : 'text-secondary';

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'w-8 h-8 flex-none inline-flex items-center justify-center rounded-lg border',
            hasUrgent
              ? 'bg-red-400/10 border-red-400/40 text-red-400'
              : 'bg-surface border-border text-primary'
          )}
        >
          <Bell className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display font-semibold text-base text-primary">Reminders</span>
            {count > 0 && <span className="text-sm text-secondary">{count}</span>}
          </div>
          {subNote && <div className={cn('text-xs mt-0.5', noteTone)}>{subNote.text}</div>}
        </div>
      </div>
      {layout && onLayoutChange && <LayoutSwitch layout={layout} onLayoutChange={onLayoutChange} />}
    </div>
  );
}

interface ReminderHeroCardProps {
  reminder: Reminder;
  state: ReminderState;
  onToggle: () => void;
  onSnooze: (minutes: number) => void;
  onPauseToggle: (id: string, paused: boolean) => void;
}

/**
 * The one consequential reminder, rendered loud: state eyebrow, recurrence
 * control, the category-check toggle, due text, a live countdown (ticking every
 * second while urgent), and snooze actions. `notified` gets a pulsing border.
 */
export function ReminderHeroCard({
  reminder,
  state,
  onToggle,
  onSnooze,
  onPauseToggle,
}: ReminderHeroCardProps) {
  const [countdown, setCountdown] = useState('');
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const styles = REMINDER_STATE_STYLES[state];
  const urgent = isUrgentState(state);
  const isPast = new Date(reminder.dueDate).getTime() < Date.now();
  const dueText = isPast
    ? formatTimeAgo(reminder.dueDate)
    : formatDueDate(reminder.dueDate, timeFormat).text;
  const EyebrowIcon = state === 'notified' ? BellRing : AlertCircle;

  let statusLabel = 'Remaining';
  if (state === 'notified') {
    statusLabel = 'Unanswered';
  } else if (state === 'overdue') {
    statusLabel = 'Overdue';
  }

  // Live per-second countdown while urgent; mirrors ReminderItem's effect.
  useEffect(() => {
    if (!urgent) {
      return;
    }
    setCountdown(formatCountdown(reminder.dueDate));
    const timer = setInterval(() => {
      setCountdown(formatCountdown(reminder.dueDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [reminder.dueDate, urgent]);

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4 transition-all',
        styles.bg,
        styles.border,
        state === 'notified' && 'reminder-glow-pulse'
      )}
    >
      {/* Eyebrow: state label + recurrence control */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide',
            styles.text
          )}
        >
          <EyebrowIcon className="w-3.5 h-3.5" />
          {styles.label}
        </span>
        <RecurrencePauseControl reminder={reminder} onPauseToggle={onPauseToggle} />
      </div>

      {/* Body: toggle + text/due (left) + prominent countdown + status (right) */}
      <div className="flex items-center gap-3 mt-3">
        <ReminderCategoryCheck reminder={reminder} state={state} onToggle={onToggle} size={28} />
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'block text-base font-medium',
              reminder.completed ? 'text-tertiary line-through' : 'text-primary'
            )}
          >
            {reminder.text}
          </span>
          <span className="block text-sm text-secondary mt-0.5">{dueText}</span>
        </div>
        {urgent && (
          <div className="flex-none text-right">
            <div className={cn('text-2xl font-bold tabular-nums leading-none', styles.text)}>
              {countdown}
            </div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-tertiary mt-1">
              {statusLabel}
            </span>
          </div>
        )}
      </div>

      {/* Snooze actions, separated from the body by a hairline divider */}
      {urgent && (
        <div className={cn('mt-3 pt-3 border-t', styles.border)}>
          <ReminderSnoozeRow onSnooze={onSnooze} state={state} />
        </div>
      )}
    </div>
  );
}

/** All-clear empty state for the reminders panel. */
export function EmptyReminders() {
  return (
    <EmptyState
      animationData={emptyRemindersAnimation}
      title="You're all caught up"
      description="Nothing needs you right now."
      size="sm"
    />
  );
}
