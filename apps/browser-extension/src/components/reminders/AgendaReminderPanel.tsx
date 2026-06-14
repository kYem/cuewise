import type { Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { isToday, parseISO } from 'date-fns';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import {
  buildReminderUrgencyNote,
  classifyReminder,
  type ReminderState,
} from '../../utils/reminder-classify';
import { dayLabel, formatCountdown, formatReminderClock } from '../../utils/reminder-date-utils';
import {
  EmptyReminders,
  RecurrencePauseControl,
  ReminderCategoryCheck,
  ReminderPanelHeader,
  ReminderSnoozeRow,
} from './atoms';
import { REMINDER_STATE_STYLES } from './reminder-state-styles';
import type { ReminderPanelProps } from './types';

export type { ReminderPanelProps } from './types';

/** States where the row expands with snooze actions (and earns the accent rail time). */
function isNudging(state: ReminderState): boolean {
  return state === 'soon' || state === 'overdue' || state === 'notified';
}

/** Compact rail label per state: "now"/"past"/countdown/clock. Ported from `railTime`. */
function railTime(reminder: Reminder, state: ReminderState, timeFormat: '12h' | '24h'): string {
  if (state === 'notified') {
    return 'now';
  }
  if (state === 'overdue') {
    return 'past';
  }
  if (state === 'soon') {
    return formatCountdown(reminder.dueDate);
  }
  return formatReminderClock(reminder.dueDate, timeFormat);
}

interface AgendaRowProps {
  reminder: Reminder;
  state: ReminderState;
  last: boolean;
  timeFormat: '12h' | '24h';
  onToggle: () => void;
  onSnooze: (minutes: number) => void;
  onPauseToggle: (id: string, paused: boolean) => void;
}

/**
 * Timeline row: a left rail [time + category-check + connector] and a right
 * column [text + recurrence control + snooze when nudging]. Ported from the
 * design `AgendaRow`.
 */
function AgendaRow({
  reminder,
  state,
  last,
  timeFormat,
  onToggle,
  onSnooze,
  onPauseToggle,
}: AgendaRowProps) {
  const styles = REMINDER_STATE_STYLES[state];
  const expand = isNudging(state);
  const showDay = state === 'upcoming' && !isToday(parseISO(reminder.dueDate));

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-none w-[52px]">
        {showDay ? (
          <span className="flex flex-col items-center leading-tight">
            <span className="text-[9px] font-semibold tracking-wide text-tertiary">
              {dayLabel(reminder.dueDate)}
            </span>
            <span className="text-xs tabular-nums text-secondary">
              {formatReminderClock(reminder.dueDate, timeFormat)}
            </span>
          </span>
        ) : (
          <span
            className={cn(
              'text-xs text-center leading-tight tabular-nums mt-px',
              expand ? cn('font-bold', styles.text) : 'font-medium text-secondary'
            )}
          >
            {railTime(reminder, state, timeFormat)}
          </span>
        )}
        <div className="mt-1.5">
          <ReminderCategoryCheck reminder={reminder} state={state} onToggle={onToggle} size={24} />
        </div>
        {!last && <span className="flex-1 w-0.5 bg-border mt-1 min-h-[10px]" />}
      </div>
      <div className={cn('flex-1 min-w-0 pt-0.5', last ? 'pb-0' : 'pb-3')}>
        <span
          className={cn(
            'block text-sm leading-snug',
            reminder.completed ? 'text-tertiary line-through' : 'text-primary'
          )}
        >
          {reminder.text}
        </span>
        {reminder.recurring && (
          <div className="mt-1">
            <RecurrencePauseControl reminder={reminder} onPauseToggle={onPauseToggle} />
          </div>
        )}
        {expand && (
          <div className="mt-2">
            <ReminderSnoozeRow onSnooze={onSnooze} state={state} />
          </div>
        )}
      </div>
    </div>
  );
}

interface AgendaGroup {
  /** Unique grouping/React key. */
  key: string;
  /** State driving the group's accent styling. */
  styleKey: ReminderState;
  label: string;
  items: Reminder[];
}

const byDueDateAsc = (a: Reminder, b: Reminder): number =>
  new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();

/** Calm groups (Later today / Upcoming) collapse past this many rows; urgent groups never cap. */
const GROUP_LIMIT = 4;

/** Build groups in severity order, sorting each by dueDate ascending, dropping empties. */
function buildGroups(reminders: Reminder[], states: Map<string, ReminderState>): AgendaGroup[] {
  // 'done' is intentionally absent: the panel only receives active reminders (store filters completed).
  // 'upcoming' is split by calendar day into "Later today" and "Upcoming"; both share upcoming styling.
  const upcoming = reminders.filter((r) => states.get(r.id) === 'upcoming').sort(byDueDateAsc);
  const laterToday = upcoming.filter((r) => isToday(parseISO(r.dueDate)));
  const afterToday = upcoming.filter((r) => !isToday(parseISO(r.dueDate)));

  const order: AgendaGroup[] = [
    { key: 'notified', styleKey: 'notified', label: 'Needs response', items: [] },
    { key: 'overdue', styleKey: 'overdue', label: 'Overdue', items: [] },
    { key: 'soon', styleKey: 'soon', label: 'Up next', items: [] },
    { key: 'later-today', styleKey: 'upcoming', label: 'Later today', items: laterToday },
    { key: 'upcoming', styleKey: 'upcoming', label: 'Upcoming', items: afterToday },
  ];
  for (const group of order) {
    if (group.styleKey !== 'upcoming') {
      group.items = reminders.filter((r) => states.get(r.id) === group.styleKey).sort(byDueDateAsc);
    }
  }
  return order.filter((group) => group.items.length > 0);
}

/**
 * Agenda (C) reminders panel: a time rail with connector segments, grouped by
 * Needs response / Overdue / Up next / Later today / Upcoming. Scannable; the
 * nudging rows expand with snooze. The widget owns positioning.
 */
export function AgendaReminderPanel({
  reminders,
  onToggle,
  onSnooze,
  onPauseToggle,
  onAdd,
  onManage,
  layout,
  onLayoutChange,
}: ReminderPanelProps) {
  // Force a re-render each second so classification and countdowns stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const now = new Date();
  const states = new Map<string, ReminderState>(
    reminders.map((r) => [r.id, classifyReminder(r, now)])
  );
  const hasUrgent = reminders.some((r) => {
    const state = states.get(r.id);
    return state === 'notified' || state === 'overdue';
  });

  const groups = buildGroups(reminders, states);
  const subNote = buildReminderUrgencyNote(reminders, states) ?? { text: 'On schedule' };
  const isEmpty = reminders.length === 0;

  return (
    <div className="w-[380px] rounded-2xl bg-surface-elevated backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <ReminderPanelHeader
          count={reminders.length}
          hasUrgent={hasUrgent}
          subNote={subNote}
          layout={layout}
          onLayoutChange={onLayoutChange}
        />
      </div>

      {isEmpty ? (
        <div className="px-4 pb-4">
          <EmptyReminders />
        </div>
      ) : (
        <div className="px-4 pb-1">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const cappable = group.key === 'later-today' || group.key === 'upcoming';
            const overflow = cappable ? group.items.length - GROUP_LIMIT : 0;
            const visibleItems =
              overflow > 0 && !isExpanded ? group.items.slice(0, GROUP_LIMIT) : group.items;

            return (
              <div key={group.key} className="mb-1.5">
                <div className="flex items-center gap-1.5 pt-1 pb-2">
                  <span
                    className={cn(
                      'text-[10.5px] font-bold tracking-wider uppercase',
                      REMINDER_STATE_STYLES[group.styleKey].text
                    )}
                  >
                    {group.label}
                  </span>
                  <span className="text-xs text-tertiary">{group.items.length}</span>
                  <span className="flex-1 h-px bg-border" />
                  {overflow > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-secondary hover:text-primary-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      {isExpanded ? 'Show less' : `+${overflow} more`}
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
                {visibleItems.map((reminder, index) => (
                  <AgendaRow
                    key={reminder.id}
                    reminder={reminder}
                    state={states.get(reminder.id) ?? 'upcoming'}
                    last={index === visibleItems.length - 1}
                    timeFormat={timeFormat}
                    onToggle={() => onToggle(reminder.id)}
                    onSnooze={(minutes) => onSnooze(reminder.id, minutes)}
                    onPauseToggle={onPauseToggle}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onAdd}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
        >
          <Plus className="w-4 h-4" />
          Add reminder
        </button>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="px-3 py-2 rounded-lg text-sm font-medium text-secondary hover:text-primary-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            Manage
          </button>
        )}
      </div>
    </div>
  );
}
