import {
  formatWallClockTime,
  formatZoneDifference,
  isZoneDaytime,
  isZoneWorkingHours,
  readZoneClock,
  type TimeFormat,
  type WorldClockZone,
  zoneDayShift,
} from '@cuewise/shared';

export interface ZoneReading {
  time: string;
  period: string;
  difference: string;
  dayShift: 'Tomorrow' | 'Yesterday' | null;
  isDay: boolean;
  isWorkingHours: boolean;
}

/** Null when this engine can't read the zone (or the device's own), so callers degrade per row. */
export function readZone(
  zone: Pick<WorldClockZone, 'timezone'>,
  now: Date,
  homeZone: string,
  format: TimeFormat
): ZoneReading | null {
  const clock = readZoneClock(now, zone.timezone);
  const home = readZoneClock(now, homeZone);
  if (clock === null || home === null) {
    return null;
  }
  const { time, period } = formatWallClockTime(clock.hour, clock.minute, format);
  return {
    time,
    period,
    difference: formatZoneDifference(clock, home),
    dayShift: zoneDayShift(clock, home),
    isDay: isZoneDaytime(clock),
    isWorkingHours: isZoneWorkingHours(clock),
  };
}
