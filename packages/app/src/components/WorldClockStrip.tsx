import { deviceTimeZone } from '@cuewise/shared';
import type React from 'react';
import { useMinuteNow } from '../hooks/useMinuteNow';
import { useSettingsStore } from '../stores/settings-store';
import { readZone } from '../utils/world-clock';

/** The world clock as one quiet line under the big clock, which stays on device time. */
export const WorldClockStrip: React.FC = () => {
  const showWorldClock = useSettingsStore((state) => state.settings.showWorldClock);
  const zones = useSettingsStore((state) => state.settings.worldClocks);
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const now = useMinuteNow();

  if (!showWorldClock) {
    return null;
  }
  const homeZone = deviceTimeZone();
  const readable = zones.flatMap((zone) => {
    const reading = readZone(zone, now, homeZone, timeFormat);
    if (reading === null) {
      return [];
    }
    return [{ zone, reading }];
  });
  if (readable.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="World clock"
      className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm md:text-base text-secondary tabular-nums"
    >
      {readable.map(({ zone, reading }) => (
        <li key={zone.id}>
          {zone.label}
          <span className="ml-1.5 font-semibold text-primary">
            {reading.time}
            {reading.period !== '' && ` ${reading.period}`}
          </span>
          {reading.dayShift !== null && (
            <span className="ml-1 text-xs text-primary-600">{reading.dayShift}</span>
          )}
        </li>
      ))}
    </ul>
  );
};
