import type { CalendarEvent } from '@cuewise/shared';
import { Calendar, RefreshCw } from 'lucide-react';
import type React from 'react';
import { Fragment } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCalendarStore } from '../stores/calendar-store';
import { useSettingsStore } from '../stores/settings-store';

interface CalendarStripProps {
  // Wide single-line "Up next" variant for the stacked Calendar + Quote layout:
  // drops past events and the now-line, shows only the next few.
  lean?: boolean;
}

function formatTime(iso: string, twentyFour: boolean): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  if (twentyFour) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'pm' : 'am';
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
}

export const CalendarStrip: React.FC<CalendarStripProps> = ({ lean = false }) => {
  const { connected, events, isLoading } = useCalendarStore(
    useShallow((s) => ({ connected: s.connected, events: s.events, isLoading: s.isLoading }))
  );
  const connect = useCalendarStore((s) => s.connect);
  const refresh = useCalendarStore((s) => s.refresh);
  const twentyFour = useSettingsStore((s) => s.settings.timeFormat === '24h');

  const width = lean ? 'w-full max-w-[520px]' : 'w-[360px] max-w-[92vw]';
  const cardClass = `${width} mx-auto bg-black/25 backdrop-blur-md rounded-2xl shadow-lg border border-white/10 p-density-md text-white`;

  const header = (right?: React.ReactNode) => (
    <div className="flex items-center justify-between mb-density-sm">
      <span className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-white/80" />
        <span className="font-semibold">{lean ? 'Up next' : 'Today'}</span>
      </span>
      {right}
    </div>
  );

  if (!connected) {
    return (
      <div className={cardClass}>
        {header()}
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-white/70">See today's schedule right on your new tab.</p>
          <button
            type="button"
            onClick={connect}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/25"
          >
            <Calendar className="w-4 h-4" /> Connect Google Calendar
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  // All-day events carry a date-only string (UTC-parsed), so never treat them as
  // past — they span the whole day and shouldn't be struck through or filtered.
  const isPast = (e: CalendarEvent) => !e.allDay && new Date(e.end) < now;
  const visible = lean ? events.filter((e) => !isPast(e)).slice(0, 3) : events;

  const syncStatus = (
    <span className="flex items-center gap-1.5 text-xs text-white/55">
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      Calendar synced
    </span>
  );

  return (
    <div className={cardClass}>
      {header(
        <button
          type="button"
          onClick={() => refresh()}
          title="Refresh"
          className="text-white/55 transition-colors hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      )}

      {!lean && <div className="mb-2 flex justify-end">{syncStatus}</div>}

      {visible.length === 0 ? (
        <p className="py-3 text-center text-sm text-white/60">
          Nothing left on the calendar today.
        </p>
      ) : (
        <div className="flex flex-col">
          {visible.map((event, i) => {
            const past = !lean && isPast(event);
            const prev = visible[i - 1];
            const showNow = !lean && prev && isPast(prev) && !isPast(event);
            return (
              <Fragment key={event.id}>
                {showNow && (
                  <div className="my-1 flex items-center gap-2">
                    <span className="text-[10px] font-bold tabular-nums">
                      {formatTime(now.toISOString(), twentyFour)}
                    </span>
                    <span className="h-px flex-1 bg-white/50" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                )}
                <div className="flex items-center gap-3 py-1.5" style={{ opacity: past ? 0.5 : 1 }}>
                  <span className="w-14 flex-none text-right text-xs font-semibold tabular-nums text-white/85">
                    {event.allDay ? 'All day' : formatTime(event.start, twentyFour)}
                  </span>
                  <span
                    className="w-[3px] flex-none self-stretch rounded-full"
                    style={{ background: event.color ?? 'rgba(255,255,255,0.5)' }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm text-white ${past ? 'line-through' : ''}`}
                  >
                    {event.title}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
