import { cityFromTimeZone, deviceTimeZone, type WorldClockZone } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Globe, Moon, Sun } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMinuteNow } from '../hooks/useMinuteNow';
import { useSettingsStore } from '../stores/settings-store';
import { readZone, type ZoneReading } from '../utils/world-clock';
import { CHIP_CLASS } from './chip-class';

function formatReading(reading: ZoneReading): string {
  if (reading.period === '') {
    return reading.time;
  }
  return `${reading.time} ${reading.period}`;
}

const ZoneRow: React.FC<{
  rowId: string;
  label: string;
  reading: ZoneReading | null;
  isHome?: boolean;
}> = ({ rowId, label, reading, isHome = false }) => {
  if (reading === null) {
    return (
      <div
        data-testid={`world-clock-row-${rowId}`}
        className="grid grid-cols-[28px_1fr_auto] items-center gap-2.5 px-1.5 py-2"
      >
        <span className="w-7 h-7 rounded-full bg-surface-variant" aria-hidden="true" />
        <span className="text-sm font-semibold text-primary truncate">{label}</span>
        <span className="text-xs text-secondary">Unavailable</span>
      </div>
    );
  }

  const DayIcon = reading.isDay ? Sun : Moon;
  return (
    <div
      data-testid={`world-clock-row-${rowId}`}
      className={cn(
        'grid grid-cols-[28px_1fr_auto] items-center gap-2.5 px-1.5 py-2 rounded-lg',
        isHome && 'bg-primary-100/60'
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-full grid place-items-center bg-surface-variant',
          reading.isDay ? 'text-warning' : 'text-primary-600'
        )}
        title={reading.isDay ? 'Day' : 'Night'}
      >
        <DayIcon className="w-4 h-4" aria-hidden="true" />
        <span className="sr-only">{reading.isDay ? 'Day' : 'Night'}</span>
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-primary truncate leading-tight">{label}</div>
        <div className="text-xs text-secondary">
          {isHome ? (
            'Here'
          ) : (
            <>
              {reading.dayShift !== null && (
                <span className="font-semibold text-primary-600">{reading.dayShift} · </span>
              )}
              <span>{reading.difference}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-display font-semibold text-lg text-primary tabular-nums leading-none">
          {reading.time}
          {reading.period !== '' && (
            <span className="ml-0.5 text-[10px] font-medium text-secondary">{reading.period}</span>
          )}
        </div>
        <div
          className={cn(
            'mt-1 text-[10px]',
            reading.isWorkingHours ? 'text-success' : 'text-secondary'
          )}
        >
          {reading.isWorkingHours ? 'Working hours' : 'Off hours'}
        </div>
      </div>
    </div>
  );
};

const WorldClockPopover: React.FC<{
  zones: WorldClockZone[];
  now: Date;
  homeZone: string;
  alignRight: boolean;
}> = ({ zones, now, homeZone, alignRight }) => {
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);

  return (
    <div
      role="dialog"
      aria-label="World clock"
      className={cn(
        'absolute top-full mt-2 z-50 w-72 rounded-2xl border border-border bg-surface-elevated shadow-xl p-3',
        alignRight ? 'right-0' : 'left-0'
      )}
    >
      <ZoneRow
        rowId="home"
        label={`${cityFromTimeZone(homeZone)} (you)`}
        reading={readZone({ timezone: homeZone }, now, homeZone, timeFormat)}
        isHome
      />
      {zones.map((zone) => (
        <ZoneRow
          key={zone.id}
          rowId={zone.id}
          label={zone.label}
          reading={readZone(zone, now, homeZone, timeFormat)}
        />
      ))}
    </div>
  );
};

/** Other cities' times as a chip in a floating cluster (ENG-23); the clock strip takes over when the big clock is on. */
export const WorldClockWidget: React.FC = () => {
  const showWorldClock = useSettingsStore((state) => state.settings.showWorldClock);
  const showClock = useSettingsStore((state) => state.settings.showClock);
  const zones = useSettingsStore((state) => state.settings.worldClocks);
  const position = useSettingsStore((state) => state.settings.worldClockPosition);
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const now = useMinuteNow();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const first = zones[0];
  if (!showWorldClock || showClock || first === undefined) {
    return null;
  }

  const homeZone = deviceTimeZone();
  const firstReading = readZone(first, now, homeZone, timeFormat);
  const firstTime = firstReading === null ? '—' : formatReading(firstReading);
  const others = zones.length - 1;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`World clock: ${first.label} ${firstTime}`}
        className={CHIP_CLASS}
      >
        <Globe className="w-5 h-5 text-primary-600" />
        <span className="hidden sm:inline text-xs font-medium text-secondary">{first.label}</span>
        <span className="text-sm font-bold text-primary tabular-nums">{firstTime}</span>
        {others > 0 && (
          <span className="text-[11px] font-semibold rounded-full px-1.5 bg-primary-100 text-primary-600">
            +{others}
          </span>
        )}
      </button>

      {isOpen && (
        <WorldClockPopover
          zones={zones}
          now={now}
          homeZone={homeZone}
          alignRight={position === 'right'}
        />
      )}
    </div>
  );
};
