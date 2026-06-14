import { formatReminderCadence, REMINDER_CATEGORY_META, type Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check, ChevronDown, ChevronUp, Pause, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  classifyReminder,
  type ReminderState,
  splitReminders,
} from '../../utils/reminder-classify';
import { formatDueDate } from '../../utils/reminder-date-utils';
import {
  EmptyReminders,
  RecurrencePauseControl,
  ReminderCategoryCheck,
  ReminderHeroCard,
  ReminderPanelHeader,
} from './atoms';
import type { ReminderPanelProps } from './types';

export type { ReminderPanelProps } from './types';

/** States where a reminder is actively asking for attention. */
function isNudging(state: ReminderState): boolean {
  return state === 'soon' || state === 'overdue' || state === 'notified';
}

/** Drop the "Today at "/"Tomorrow at " prefix so only the clock time remains. */
function clockLabel(dueDate: string): string {
  return formatDueDate(dueDate).text.replace('Today at ', '').replace('Tomorrow at ', 'Tmrw ');
}

interface HabitPillProps {
  reminder: Reminder;
  state: ReminderState;
  onToggle: () => void;
  onPauseToggle: (id: string, paused: boolean) => void;
}

/**
 * Ambient habit chip: a category dot/text/cadence pill that is tap-to-mark-done
 * when active, shows a pulsing check while nudging, and resumes on tap when
 * paused. Ported from the design `HabitPill`.
 */
function HabitPill({ reminder, state, onToggle, onPauseToggle }: HabitPillProps) {
  const [hover, setHover] = useState(false);
  const paused = reminder.paused === true;
  const nudging = isNudging(state);
  const category = reminder.category ?? 'productivity';
  const categoryColor = REMINDER_CATEGORY_META[category].color;
  const showCheck = nudging || (!paused && hover);
  const cadence = reminder.recurring ? formatReminderCadence(reminder.recurring) : '';

  function handleClick() {
    if (paused) {
      onPauseToggle(reminder.id, false);
      return;
    }
    onToggle();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={paused ? `Resume ${reminder.text}` : `Mark ${reminder.text} done`}
      title={paused ? 'Paused — tap to resume' : 'Tap to mark done'}
      className={cn(
        'inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border transition-all',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
        nudging && 'animate-pulse',
        paused
          ? 'bg-surface-variant border-border text-tertiary'
          : 'bg-surface border-border text-primary hover:border-primary-300'
      )}
      style={nudging ? { borderColor: categoryColor } : undefined}
    >
      <span className="inline-flex items-center justify-center w-4 h-4 flex-none">
        {paused ? (
          <Pause className="w-3 h-3 text-tertiary" />
        ) : showCheck ? (
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: categoryColor }} />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: categoryColor }} />
        )}
      </span>
      <span className="text-sm font-medium whitespace-nowrap">{reminder.text}</span>
      <span className="text-xs text-tertiary">{paused ? 'paused' : cadence}</span>
    </button>
  );
}

interface HabitStripProps {
  habits: Reminder[];
  states: Map<string, ReminderState>;
  onToggle: (id: string) => void;
  onPauseToggle: (id: string, paused: boolean) => void;
}

const HABIT_COLLAPSE = 6;

/** "HABITS {n}" subheader + wrapping pills, collapsing past 6 (nudging first). */
function HabitStrip({ habits, states, onToggle, onPauseToggle }: HabitStripProps) {
  const [expanded, setExpanded] = useState(false);
  const nudgingCount = habits.filter((h) => isNudging(states.get(h.id) ?? 'upcoming')).length;

  // Nudging pills surface first so urgent ones are never hidden when collapsed.
  const ordered = [...habits].sort((a, b) => {
    const aNudging = isNudging(states.get(a.id) ?? 'upcoming') ? 1 : 0;
    const bNudging = isNudging(states.get(b.id) ?? 'upcoming') ? 1 : 0;
    return bNudging - aNudging;
  });
  const overflow = ordered.length - HABIT_COLLAPSE;
  const visible = expanded || overflow <= 0 ? ordered : ordered.slice(0, HABIT_COLLAPSE);

  return (
    <div>
      <div className="flex items-center gap-1.5 pb-2.5">
        <span className="text-[10.5px] font-bold tracking-wider uppercase text-secondary">
          Habits
        </span>
        <span className="text-xs text-tertiary">{habits.length}</span>
        {nudgingCount > 0 && (
          <span className="text-xs text-primary-600">· {nudgingCount} nudging now</span>
        )}
        <span className="flex-1 h-px bg-border" />
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-secondary hover:text-primary-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {expanded ? 'Show less' : `+${overflow} more`}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((habit) => (
          <HabitPill
            key={habit.id}
            reminder={habit}
            state={states.get(habit.id) ?? 'upcoming'}
            onToggle={() => onToggle(habit.id)}
            onPauseToggle={onPauseToggle}
          />
        ))}
      </div>
    </div>
  );
}

interface SchedRowProps {
  reminder: Reminder;
  state: ReminderState;
  first: boolean;
  onToggle: () => void;
  onPauseToggle: (id: string, paused: boolean) => void;
}

/** Clean scheduled row: [time] · category-check · text · recurrence control. */
function SchedRow({ reminder, state, first, onToggle, onPauseToggle }: SchedRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5',
        first ? 'border-t-0' : 'border-t border-border/60'
      )}
    >
      <span className="w-16 flex-none text-xs text-secondary tabular-nums text-right whitespace-nowrap">
        {clockLabel(reminder.dueDate)}
      </span>
      <ReminderCategoryCheck reminder={reminder} state={state} onToggle={onToggle} size={20} />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={cn(
            'flex-1 min-w-0 text-sm truncate',
            reminder.completed ? 'text-tertiary line-through' : 'text-primary'
          )}
        >
          {reminder.text}
        </span>
        <RecurrencePauseControl reminder={reminder} onPauseToggle={onPauseToggle} />
      </div>
    </div>
  );
}

/**
 * Composed (D) reminders panel: an ambient habit strip for reflexive nudges, a
 * scheduled timeline for clock-anchored items, and the hero glow as a *state*
 * the one consequential overdue item borrows. The widget owns positioning.
 */
export function ComposedReminderPanel({
  reminders,
  onToggle,
  onSnooze,
  onPauseToggle,
  onAdd,
  onManage,
}: ReminderPanelProps) {
  // Force a re-render each second so classification and countdowns stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const now = new Date();
  const states = new Map<string, ReminderState>(
    reminders.map((r) => [r.id, classifyReminder(r, now)])
  );
  const hasUrgent = reminders.some((r) => {
    const state = states.get(r.id);
    return state === 'notified' || state === 'overdue';
  });

  const { habits, scheduled } = splitReminders(reminders);
  const sortedScheduled = [...scheduled].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );
  // The most urgent scheduled item becomes the hero; the rest stay as rows.
  const hero = sortedScheduled.find((r) => {
    const state = states.get(r.id);
    return state === 'notified' || state === 'overdue';
  });
  const rows = hero ? sortedScheduled.filter((r) => r.id !== hero.id) : sortedScheduled;
  const isEmpty = reminders.length === 0;

  return (
    <div className="w-[380px] rounded-2xl bg-surface/95 backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <ReminderPanelHeader
          count={reminders.length}
          hasUrgent={hasUrgent}
          subNote={{ text: `${habits.length} habits · ${scheduled.length} scheduled` }}
        />
      </div>

      {isEmpty ? (
        <div className="px-4 pb-4">
          <EmptyReminders />
        </div>
      ) : (
        <>
          {habits.length > 0 && (
            <div className="px-4 pb-3.5">
              <HabitStrip
                habits={habits}
                states={states}
                onToggle={onToggle}
                onPauseToggle={onPauseToggle}
              />
            </div>
          )}

          {scheduled.length > 0 && (
            <div className="px-4 pb-1.5">
              <div className="flex items-center gap-1.5 pt-1 pb-3">
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-secondary">
                  Scheduled
                </span>
                <span className="text-xs text-tertiary">{scheduled.length}</span>
                <span className="flex-1 h-px bg-border" />
              </div>
              {hero && (
                <div className="mb-3.5">
                  <ReminderHeroCard
                    reminder={hero}
                    state={states.get(hero.id) ?? 'upcoming'}
                    onToggle={() => onToggle(hero.id)}
                    onSnooze={(minutes) => onSnooze(hero.id, minutes)}
                    onPauseToggle={onPauseToggle}
                  />
                </div>
              )}
              {rows.map((reminder, index) => (
                <SchedRow
                  key={reminder.id}
                  reminder={reminder}
                  state={states.get(reminder.id) ?? 'upcoming'}
                  first={index === 0 && !hero}
                  onToggle={() => onToggle(reminder.id)}
                  onPauseToggle={onPauseToggle}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onAdd}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
        >
          <Plus className="w-4 h-4" />
          Add reminder
        </button>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="px-3 py-2 rounded-lg text-sm font-medium text-secondary hover:text-primary-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Manage
          </button>
        )}
      </div>
    </div>
  );
}
