import {
  FOCUS_WEEKDAY_ORDER,
  type FocusPeak,
  findFocusPeak,
  type TimeFormat,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Grid3x3 } from 'lucide-react';
import type React from 'react';
import { useId, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { FILLED_INTENSITY_LEVELS, INTENSITY_COLORS, intensityLevel } from './heatmap-intensity';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const AXIS_HOURS = [0, 6, 12, 18];

function hourLabel(hour: number, timeFormat: TimeFormat): string {
  if (timeFormat === '24h') {
    return `${(hour % 24).toString().padStart(2, '0')}:00`;
  }
  const period = hour % 24 >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

function cellLabel(weekday: number, hour: number, count: number, timeFormat: TimeFormat): string {
  const sessions = count === 0 ? 'no sessions' : `${count} session${count === 1 ? '' : 's'}`;
  const range = `${hourLabel(hour, timeFormat)}–${hourLabel(hour + 1, timeFormat)}`;
  return `${WEEKDAY_SHORT[weekday]} ${range} · ${sessions}`;
}

function takeaway(peak: FocusPeak | null): string {
  if (peak === null) {
    return 'Complete a few more sessions to see your pattern';
  }
  return `Most focused: ${WEEKDAY_LONG[peak.weekday]} ${peak.dayPart}s`;
}

interface FocusHeatmapProps {
  /** Sessions per [weekday 0=Sunday][hour 0-23]. */
  data: number[][];
}

type Cell = { row: number; hour: number };

/** When in the week focus happens: weekday rows by hour columns, with one plain-language takeaway. */
export const FocusHeatmap: React.FC<FocusHeatmapProps> = ({ data }) => {
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const [active, setActive] = useState<Cell | null>(null);
  const [focusCell, setFocusCell] = useState<Cell>({ row: 0, hour: 0 });
  const headingId = useId();
  const max = Math.max(...data.flat(), 1);

  const moveFocus = (event: React.KeyboardEvent<HTMLElement>, { row, hour }: Cell) => {
    const moves: Record<string, Cell> = {
      ArrowUp: { row: Math.max(row - 1, 0), hour },
      ArrowDown: { row: Math.min(row + 1, 6), hour },
      ArrowLeft: { row, hour: Math.max(hour - 1, 0) },
      ArrowRight: { row, hour: Math.min(hour + 1, 23) },
      Home: { row, hour: 0 },
      End: { row, hour: 23 },
    };
    const next = moves[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    setFocusCell(next);
    const grid = event.currentTarget.closest('table');
    const target = grid?.querySelector<HTMLElement>(`[data-cell="${next.row}-${next.hour}"]`);
    target?.focus();
  };

  return (
    <section className="bg-surface rounded-xl shadow-lg p-8 mb-8" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 id={headingId} className="text-2xl font-bold text-primary flex items-center gap-3">
          <Grid3x3 className="w-6 h-6 text-primary-600" />
          Focus heatmap
        </h2>
        <p className="text-sm font-medium text-secondary">{takeaway(findFocusPeak(data))}</p>
      </div>

      <table
        aria-label="Focus sessions by weekday and hour"
        className="w-full table-fixed border-separate border-spacing-1"
      >
        <thead>
          <tr>
            <td className="w-10" />
            {AXIS_HOURS.map((hour) => (
              <th
                key={hour}
                scope="colgroup"
                colSpan={6}
                className="text-left text-xs font-normal text-tertiary"
              >
                {hourLabel(hour, timeFormat)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FOCUS_WEEKDAY_ORDER.map((weekday, row) => (
            <tr key={weekday}>
              <th scope="row" className="text-left text-xs font-normal text-secondary">
                {WEEKDAY_SHORT[weekday]}
              </th>
              {HOURS.map((hour) => {
                const count = data[weekday][hour];
                const level = intensityLevel(count, max);
                const label = cellLabel(weekday, hour, count, timeFormat);
                const isActive = active?.row === row && active.hour === hour;
                const isFocusable = focusCell.row === row && focusCell.hour === hour;
                return (
                  <td key={hour} className="relative p-0">
                    <button
                      type="button"
                      aria-label={label}
                      data-cell={`${row}-${hour}`}
                      tabIndex={isFocusable ? 0 : -1}
                      onMouseEnter={() => setActive({ row, hour })}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => {
                        setActive({ row, hour });
                        setFocusCell({ row, hour });
                      }}
                      onBlur={() => setActive(null)}
                      onKeyDown={(event) => moveFocus(event, { row, hour })}
                      className={cn(
                        'block w-full h-6 rounded-sm cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                        level === 'none' && 'ring-1 ring-inset ring-border'
                      )}
                      style={
                        level === 'none' ? undefined : { backgroundColor: INTENSITY_COLORS[level] }
                      }
                    />
                    {isActive ? (
                      <span
                        role="tooltip"
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 whitespace-nowrap rounded-md bg-surface-elevated px-2 py-1 text-xs text-primary shadow-lg border border-border pointer-events-none"
                      >
                        {label}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex items-center justify-end gap-1 text-xs text-secondary">
        <span className="mr-1">Less</span>
        <span className="w-4 h-4 rounded-sm ring-1 ring-inset ring-border" />
        {FILLED_INTENSITY_LEVELS.map((level) => (
          <span
            key={level}
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: INTENSITY_COLORS[level] }}
          />
        ))}
        <span className="ml-1">More</span>
      </div>
    </section>
  );
};
