import type { CalendarEvent } from '@cuewise/shared';
import { cn, Tooltip } from '@cuewise/ui';
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
  // 'overlay' (default): white-on-dark glass, for the Pomodoro image background.
  // 'surface': theme tokens, for the home new tab where the background follows
  // the theme (and can be light), matching the goals card / QuoteDisplay.
  variant?: 'overlay' | 'surface';
}

// Per-variant color classes (module-level so they aren't rebuilt each render).
// 'overlay' keeps the immersive white-on-dark glass look; 'surface' uses theme
// tokens so the strip is readable on light themes.
const SURFACE_TOKENS = {
  card: 'bg-surface/80 backdrop-blur-sm border-border text-primary',
  icon: 'text-secondary',
  muted: 'text-secondary',
  faint: 'text-tertiary',
  time: 'text-secondary',
  title: 'text-primary',
  connectBtn: 'border-border bg-surface-variant text-primary hover:bg-surface-variant/70',
  refresh: 'text-tertiary hover:text-primary',
  nowLine: 'bg-divider',
  nowDot: 'bg-primary',
  bar: 'bg-divider',
  empty: 'text-secondary',
  error: 'text-red-500 dark:text-red-400',
} as const;

const OVERLAY_TOKENS = {
  card: 'bg-black/25 backdrop-blur-md border-white/10 text-white',
  icon: 'text-white/80',
  muted: 'text-white/70',
  faint: 'text-white/55',
  time: 'text-white/85',
  title: 'text-white',
  connectBtn: 'border-white/20 bg-white/15 text-white hover:bg-white/25',
  refresh: 'text-white/55 hover:text-white',
  nowLine: 'bg-white/50',
  nowDot: 'bg-white',
  bar: 'bg-white/50',
  empty: 'text-white/60',
  error: 'text-red-300',
} as const;

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

export const CalendarStrip: React.FC<CalendarStripProps> = ({
  lean = false,
  variant = 'overlay',
}) => {
  const { connected, events, isLoading, error } = useCalendarStore(
    useShallow((s) => ({
      connected: s.connected,
      events: s.events,
      isLoading: s.isLoading,
      error: s.error,
    }))
  );
  const connect = useCalendarStore((s) => s.connect);
  const refresh = useCalendarStore((s) => s.refresh);
  const twentyFour = useSettingsStore((s) => s.settings.timeFormat === '24h');

  const t = variant === 'surface' ? SURFACE_TOKENS : OVERLAY_TOKENS;
  // Match the goals card (max-w-[400px]) in the surface/home layout so the
  // stacked "both" view lines up; the Pomodoro overlay keeps its 360px card and
  // the lean "Up next" strip stays wide.
  let width = 'w-[360px] max-w-[92vw]';
  if (lean) {
    width = 'w-full max-w-[520px]';
  } else if (variant === 'surface') {
    width = 'w-full max-w-[400px]';
  }
  const cardClass = cn(width, 'mx-auto rounded-2xl border p-density-md shadow-lg', t.card);

  const header = (right?: React.ReactNode) => (
    <div className="flex items-center justify-between mb-density-sm">
      <span className="flex items-center gap-2">
        <Calendar className={cn('w-4 h-4', t.icon)} />
        <span className="font-semibold">{lean ? 'Up next' : 'Today'}</span>
      </span>
      <span className="flex items-center gap-1.5">{right}</span>
    </div>
  );

  if (!connected) {
    return (
      <div className={cardClass}>
        {header()}
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className={cn('text-sm', t.muted)}>See today's schedule right on your new tab.</p>
          <button
            type="button"
            onClick={connect}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60',
              t.connectBtn
            )}
          >
            <Calendar className="w-4 h-4" /> {isLoading ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
          {error && <p className={cn('max-w-[260px] text-xs', t.error)}>{error}</p>}
        </div>
      </div>
    );
  }

  const now = new Date();
  // All-day events carry a date-only string (UTC-parsed), so never treat them as
  // past — they span the whole day and shouldn't be struck through or filtered.
  const isPast = (e: CalendarEvent) => !e.allDay && new Date(e.end) < now;

  // Lean "Up next": timed events first so all-day banners (never past, sorted
  // first by the API) don't fill all three slots and hide actual meetings.
  let visible = events;
  if (lean) {
    const upcoming = events.filter((e) => !isPast(e));
    const timed = upcoming.filter((e) => !e.allDay);
    const allDay = upcoming.filter((e) => e.allDay);
    visible = [...timed, ...allDay].slice(0, 3);
  }

  // Single now-line at the first past→upcoming transition. Computed once (so
  // overlapping events can't draw it twice) and transition-based rather than
  // "first upcoming event" so a leading non-past all-day banner or a long event
  // spanning now doesn't suppress it when real past events follow.
  const nowLineIndex = lean
    ? -1
    : visible.findIndex((e, i) => i > 0 && isPast(visible[i - 1]) && !isPast(e));

  // Sync status as a small dot beside the refresh button, with a proper tooltip
  // label (so it costs no row, and a failed sync still shows — red — in lean mode).
  const statusLabel = error ? "Couldn't sync" : 'Calendar synced';
  const statusDot = (
    <Tooltip label={statusLabel}>
      <span
        role="img"
        aria-label={statusLabel}
        className={cn('h-2 w-2 shrink-0 rounded-full', error ? 'bg-red-400' : 'bg-green-400')}
      />
    </Tooltip>
  );

  return (
    <div className={cardClass}>
      {header(
        <>
          {statusDot}
          <button
            type="button"
            onClick={() => refresh()}
            title="Refresh"
            className={cn('transition-colors', t.refresh)}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </>
      )}

      {visible.length === 0 ? (
        <p className={cn('py-3 text-center text-sm', t.empty)}>
          Nothing left on the calendar today.
        </p>
      ) : (
        <div className="flex flex-col">
          {visible.map((event, i) => {
            const past = !lean && isPast(event);
            const showNow = i === nowLineIndex;
            return (
              <Fragment key={event.id}>
                {showNow && (
                  <div className="my-1 flex items-center gap-2">
                    <span className="text-[10px] font-bold tabular-nums">
                      {formatTime(now.toISOString(), twentyFour)}
                    </span>
                    <span className={cn('h-px flex-1', t.nowLine)} />
                    <span className={cn('h-1.5 w-1.5 rounded-full', t.nowDot)} />
                  </div>
                )}
                <div className="flex items-center gap-3 py-1.5" style={{ opacity: past ? 0.5 : 1 }}>
                  <span
                    className={cn(
                      'w-14 flex-none text-right text-xs font-semibold tabular-nums',
                      t.time
                    )}
                  >
                    {event.allDay ? 'All day' : formatTime(event.start, twentyFour)}
                  </span>
                  <span
                    className={cn(
                      'w-[3px] flex-none self-stretch rounded-full',
                      !event.color && t.bar
                    )}
                    style={event.color ? { background: event.color } : undefined}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      t.title,
                      past && 'line-through'
                    )}
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
