import { type HabitStats, REMINDER_CATEGORY_META, type Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { HabitDayStrip } from './HabitDayStrip';

interface HabitStatsCardProps {
  reminder: Reminder;
  stats: HabitStats;
}

function Figure({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          'font-display text-xl font-bold',
          accent ? 'text-orange-500' : 'text-primary'
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-secondary">{label}</div>
    </div>
  );
}

export function HabitStatsCard({ reminder, stats }: HabitStatsCardProps) {
  const color = REMINDER_CATEGORY_META[reminder.category ?? 'productivity'].color;
  const target =
    reminder.recurring?.frequency === 'interval' ? reminder.recurring.dailyTarget : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 truncate text-sm font-semibold text-primary">{reminder.text}</span>
        {target !== undefined && (
          <span className="ml-auto flex-none text-xs text-tertiary">{target} a day</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Figure value={String(stats.current)} label="day streak" accent />
        <Figure value={String(stats.best)} label="best this year" />
        <Figure value={stats.rate30 === null ? '—' : `${stats.rate30}%`} label="last 30 days" />
      </div>
      <HabitDayStrip cells={stats.last30} label={reminder.text} columns={15} />
      <div className="flex justify-between text-[11px] text-tertiary">
        <span>30 days ago</span>
        <a href="#insights" className="font-semibold text-primary-600 hover:text-primary-700">
          View in Insights
        </a>
      </div>
    </div>
  );
}
