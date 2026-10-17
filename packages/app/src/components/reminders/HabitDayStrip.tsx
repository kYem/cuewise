import type { HabitDayCell } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { INTENSITY_COLORS } from '../heatmap-intensity';

interface HabitDayStripProps {
  cells: HabitDayCell[];
  label: string;
  columns?: number;
  className?: string;
}

function cellColor(cell: HabitDayCell): string {
  if (cell.state === 'kept') {
    return INTENSITY_COLORS.peak;
  }
  if (cell.state === 'partial' || (cell.state === 'pending' && cell.count > 0)) {
    return INTENSITY_COLORS.low;
  }
  return INTENSITY_COLORS.none;
}

/** One cell per day, oldest first; today is outlined and off days are dimmed. */
export function HabitDayStrip({
  cells,
  label,
  columns = cells.length,
  className,
}: HabitDayStripProps) {
  const kept = cells.filter((cell) => cell.state === 'kept').length;
  return (
    <div
      role="img"
      aria-label={`${label}: ${kept} of the last ${cells.length} days kept`}
      className={cn('grid gap-1', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cells.map((cell, index) => (
        <span
          key={cell.date}
          className={cn(
            'aspect-square rounded-[3px]',
            cell.state === 'off' && 'opacity-40',
            index === cells.length - 1 &&
              'outline outline-[1.5px] outline-offset-1 outline-primary-500'
          )}
          style={{ backgroundColor: cellColor(cell) }}
        />
      ))}
    </div>
  );
}
