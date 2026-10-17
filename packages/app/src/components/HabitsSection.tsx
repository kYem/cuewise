import {
  getHabitStats,
  type HabitDay,
  type HabitStats,
  REMINDER_CATEGORY_META,
  type Reminder,
} from '@cuewise/shared';
import { CheckCircle2, Flame, TrendingUp } from 'lucide-react';
import { HabitDayStrip } from './reminders/HabitDayStrip';

export const HABIT_HISTORY_SYNC_NOTICE =
  'Habit history stays on this device; it syncs with a Cuewise account.';

const COLUMN_LABEL = 'text-xs text-tertiary';
const ROW_CELL = 'border-t border-border/60 py-3.5';

interface HabitsSectionProps {
  habits: Reminder[];
  habitHistory: HabitDay[];
  chromeSyncOn: boolean;
}

interface HabitRow {
  reminder: Reminder;
  stats: HabitStats;
}

export function HabitsSection({ habits, habitHistory, chromeSyncOn }: HabitsSectionProps) {
  if (habits.length === 0) {
    return null;
  }
  const now = new Date();
  const rows: HabitRow[] = habits.map((reminder) => ({
    reminder,
    stats: getHabitStats(reminder, habitHistory, now),
  }));
  const keptToday = rows.filter((row) => row.stats.last30.at(-1)?.state === 'kept').length;
  const steadiest = rows.reduce((top, row) => (row.stats.current > top.stats.current ? row : top));
  const rated = rows.flatMap((row) => (row.stats.rate30 === null ? [] : [row.stats.rate30]));
  const consistency =
    rated.length === 0
      ? null
      : Math.round(rated.reduce((sum, rate) => sum + rate, 0) / rated.length);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {keptToday}/{rows.length}
            </span>
          </div>
          <h3 className="text-secondary text-sm font-medium mb-1">Kept Today</h3>
          <p className="text-xs text-tertiary">Habits whose day is already done</p>
        </div>
        <div className="bg-surface rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Flame className="w-6 h-6 text-orange-600" />
            </div>
            <span className="text-3xl font-bold text-orange-600">{steadiest.stats.current}</span>
          </div>
          <h3 className="text-secondary text-sm font-medium mb-1">Longest Running Streak</h3>
          <p className="text-xs text-tertiary">
            {steadiest.reminder.text} · best this year: {steadiest.stats.best} days
          </p>
        </div>
        <div className="bg-surface rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-primary-600/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-primary-600" />
            </div>
            <span className="text-3xl font-bold text-primary-600">
              {consistency === null ? '—' : `${consistency}%`}
            </span>
          </div>
          <h3 className="text-secondary text-sm font-medium mb-1">30-Day Consistency</h3>
          <p className="text-xs text-tertiary">Kept days across your habits</p>
        </div>
      </div>

      <section className="bg-surface rounded-xl shadow-lg p-8 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <Flame className="w-6 h-6 text-primary-600" />
          <h2 className="text-2xl font-bold text-primary">Habits</h2>
        </div>
        <div className="grid grid-cols-[minmax(0,12rem)_5rem_6rem_9rem_minmax(0,1fr)] items-center gap-x-6">
          <span className={COLUMN_LABEL}>Habit</span>
          <span className={COLUMN_LABEL}>Streak</span>
          <span className={COLUMN_LABEL}>Best this year</span>
          <span className={COLUMN_LABEL}>Last 30 days</span>
          <span className={`flex justify-between ${COLUMN_LABEL}`}>
            <span>30 days ago</span>
            <span>Today</span>
          </span>
          {rows.map(({ reminder, stats }) => (
            <HabitRowCells key={reminder.id} reminder={reminder} stats={stats} />
          ))}
        </div>
        {chromeSyncOn && <p className="mt-4 text-xs text-tertiary">{HABIT_HISTORY_SYNC_NOTICE}</p>}
      </section>
    </>
  );
}

function HabitRowCells({ reminder, stats }: HabitRow) {
  const color = REMINDER_CATEGORY_META[reminder.category ?? 'productivity'].color;
  return (
    <>
      <span className={`flex items-center gap-2.5 ${ROW_CELL} text-sm font-semibold text-primary`}>
        <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{reminder.text}</span>
      </span>
      <span className={`${ROW_CELL} text-sm font-bold text-orange-600`}>
        {stats.current > 0 ? `${stats.current} days` : '—'}
      </span>
      <span className={`${ROW_CELL} text-sm text-secondary`}>{stats.best} d</span>
      <span
        data-testid={`habit-rate-${reminder.id}`}
        className={`flex items-center gap-2.5 ${ROW_CELL}`}
      >
        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-variant">
          <span
            data-testid="habit-rate-fill"
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${stats.rate30 ?? 0}%`, backgroundColor: color }}
          />
        </span>
        <span className="w-9 text-right text-[13px] font-bold text-primary">
          {stats.rate30 === null ? '—' : `${stats.rate30}%`}
        </span>
      </span>
      <span className={ROW_CELL}>
        <HabitDayStrip cells={stats.last30} label={reminder.text} />
      </span>
    </>
  );
}
