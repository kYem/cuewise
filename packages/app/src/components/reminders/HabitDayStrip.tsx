import type { HabitDayCell } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import type { CSSProperties } from 'react';
import { INTENSITY_COLORS } from '../heatmap-intensity';

interface HabitDayStripProps {
  cells: HabitDayCell[];
  label: string;
  columns?: number;
  className?: string;
}

type CellShape = 'full' | 'half' | 'outline' | 'empty';

/** Kept, partial and missed differ in shape as well as shade, so colour is never the only cue. */
const SHAPE_STYLES: Record<CellShape, CSSProperties> = {
  full: { backgroundColor: INTENSITY_COLORS.peak },
  half: {
    backgroundColor: INTENSITY_COLORS.none,
    backgroundImage: `linear-gradient(to top, ${INTENSITY_COLORS.peak} 50%, transparent 50%)`,
  },
  outline: {
    backgroundColor: INTENSITY_COLORS.none,
    boxShadow: `inset 0 0 0 1.5px ${INTENSITY_COLORS.peak}`,
  },
  empty: { backgroundColor: INTENSITY_COLORS.none },
};

function cellShape(cell: HabitDayCell): CellShape {
  if (cell.state === 'kept') {
    return 'full';
  }
  if (cell.state === 'partial' || (cell.state === 'pending' && cell.count > 0)) {
    return 'half';
  }
  if (cell.state === 'missed') {
    return 'outline';
  }
  return 'empty';
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
      {cells.map((cell, index) => {
        const shape = cellShape(cell);
        return (
          <span
            key={cell.date}
            data-testid={`habit-day-${cell.date}`}
            data-shape={shape}
            className={cn(
              'aspect-square rounded-[3px]',
              cell.state === 'off' && 'opacity-40',
              index === cells.length - 1 &&
                'outline outline-[1.5px] outline-offset-1 outline-primary-500'
            )}
            style={SHAPE_STYLES[shape]}
          />
        );
      })}
    </div>
  );
}
