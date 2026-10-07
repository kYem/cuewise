import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldClockZone } from './types';
import { formatWallClockTime } from './utils';
import {
  addWorldClock,
  cityFromTimeZone,
  formatZoneDifference,
  isZoneDaytime,
  isZoneWorkingHours,
  MAX_WORLD_CLOCK_LABEL,
  MAX_WORLD_CLOCKS,
  moveWorldClockUp,
  readZoneClock,
  removeWorldClock,
  renameWorldClock,
  sameTimeZone,
  searchTimeZones,
  shownWorldClocks,
  type ZoneClock,
  zoneDayShift,
} from './world-clock';

const JUNE = new Date('2026-06-15T12:00:00Z');
const MARCH_GAP = new Date('2026-03-20T12:00:00Z');

function clockAt(instant: Date, timeZone: string): ZoneClock {
  const clock = readZoneClock(instant, timeZone);
  expect(clock).not.toBeNull();
  return clock as ZoneClock;
}

function zoneAt(hour: number, weekday: number): ZoneClock {
  return { hour, minute: 0, weekday, dateKey: '2026-06-15', offsetMinutes: 0 };
}

const TOKYO: WorldClockZone = { id: 'tokyo', label: 'Tokyo', timezone: 'Asia/Tokyo' };
const LONDON: WorldClockZone = { id: 'london', label: 'London', timezone: 'Europe/London' };
const AUSTIN: WorldClockZone = {
  id: 'austin',
  label: 'Austin office',
  timezone: 'America/Chicago',
};

describe('readZoneClock', () => {
  it('reads the wall-clock time, weekday, date and offset in another zone', () => {
    expect(readZoneClock(JUNE, 'Asia/Tokyo')).toEqual({
      hour: 21,
      minute: 0,
      weekday: 1,
      dateKey: '2026-06-15',
      offsetMinutes: 540,
    });
  });

  it('returns null for a zone this engine does not know instead of throwing', () => {
    expect(readZoneClock(JUNE, 'Not/AZone')).toBeNull();
  });
});

describe('formatZoneDifference', () => {
  it('shows half-hour offsets in hours and minutes', () => {
    expect(formatZoneDifference(clockAt(JUNE, 'Asia/Kolkata'), clockAt(JUNE, 'UTC'))).toBe(
      '+5h 30m'
    );
  });

  it('shows quarter-hour offsets', () => {
    expect(formatZoneDifference(clockAt(JUNE, 'Asia/Kathmandu'), clockAt(JUNE, 'UTC'))).toBe(
      '+5h 45m'
    );
  });

  it('follows daylight saving at the given instant', () => {
    const london = 'Europe/London';
    const newYork = 'America/New_York';

    expect(formatZoneDifference(clockAt(MARCH_GAP, newYork), clockAt(MARCH_GAP, london))).toBe(
      '−4h'
    );
    expect(formatZoneDifference(clockAt(JUNE, newYork), clockAt(JUNE, london))).toBe('−5h');
  });

  it('says same time for an equal offset', () => {
    expect(
      formatZoneDifference(clockAt(JUNE, 'Europe/London'), clockAt(JUNE, 'Europe/Dublin'))
    ).toBe('Same time');
  });
});

describe('zoneDayShift', () => {
  it('marks a zone already on the next day as tomorrow', () => {
    expect(zoneDayShift(clockAt(JUNE, 'Pacific/Kiritimati'), clockAt(JUNE, 'Europe/London'))).toBe(
      'Tomorrow'
    );
  });

  it('marks a zone still on the previous day as yesterday', () => {
    expect(
      zoneDayShift(clockAt(JUNE, 'Pacific/Pago_Pago'), clockAt(JUNE, 'Pacific/Kiritimati'))
    ).toBe('Yesterday');
  });

  it('counts two calendar days for a zone that far apart', () => {
    const lateInPagoPago = new Date('2026-06-15T10:30:00Z');
    const kiritimati = clockAt(lateInPagoPago, 'Pacific/Kiritimati');
    const pagoPago = clockAt(lateInPagoPago, 'Pacific/Pago_Pago');

    expect(zoneDayShift(kiritimati, pagoPago)).toBe('+2 days');
    expect(zoneDayShift(pagoPago, kiritimati)).toBe('−2 days');
  });

  it('marks the same day as no shift', () => {
    expect(zoneDayShift(clockAt(JUNE, 'Europe/Paris'), clockAt(JUNE, 'Europe/London'))).toBeNull();
  });
});

describe('isZoneDaytime', () => {
  it('counts 07:00 to 18:59 as day', () => {
    expect(isZoneDaytime({ ...zoneAt(6, 1), minute: 59 })).toBe(false);
    expect(isZoneDaytime(zoneAt(7, 1))).toBe(true);
    expect(isZoneDaytime({ ...zoneAt(18, 1), minute: 59 })).toBe(true);
    expect(isZoneDaytime(zoneAt(19, 1))).toBe(false);
  });
});

describe('isZoneWorkingHours', () => {
  it('counts weekdays from 09:00 to 16:59', () => {
    expect(isZoneWorkingHours(zoneAt(9, 1))).toBe(true);
    expect(isZoneWorkingHours(zoneAt(17, 1))).toBe(false);
    expect(isZoneWorkingHours(zoneAt(8, 3))).toBe(false);
  });

  it('never counts weekends', () => {
    expect(isZoneWorkingHours(zoneAt(10, 6))).toBe(false);
    expect(isZoneWorkingHours(zoneAt(10, 0))).toBe(false);
  });
});

describe('cityFromTimeZone', () => {
  it('takes the last segment and restores spaces', () => {
    expect(cityFromTimeZone('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });
});

describe('renamed zones', () => {
  it("names a city by today's name when the engine reports the old one", () => {
    expect(cityFromTimeZone('Asia/Calcutta')).toBe('Kolkata');
    expect(cityFromTimeZone('Europe/Kiev')).toBe('Kyiv');
    expect(cityFromTimeZone('Asia/Saigon')).toBe('Ho Chi Minh City');
  });

  it('finds a renamed city by either name', () => {
    const match = [{ timezone: 'Asia/Calcutta', city: 'Kolkata', region: 'Asia' }];

    expect(searchTimeZones('kolk', ['Asia/Calcutta'])).toEqual(match);
    expect(searchTimeZones('calc', ['Asia/Calcutta'])).toEqual(match);
  });

  it("finds Kolkata in this engine's own zone list", () => {
    expect(searchTimeZones('kolkata').map((m) => m.city)).toEqual(['Kolkata']);
  });

  it('treats an old and a new zone id as the same zone', () => {
    expect(sameTimeZone('Asia/Calcutta', 'Asia/Kolkata')).toBe(true);
    expect(sameTimeZone('Asia/Tokyo', 'Asia/Seoul')).toBe(false);
  });
});

describe('searchTimeZones', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ZONES = [
    'Asia/Tokyo',
    'Europe/London',
    'America/New_York',
    'Etc/GMT+5',
    'UTC',
    'America/Toronto',
  ];

  it('matches a city by prefix', () => {
    expect(searchTimeZones('tok', ZONES)).toEqual([
      { timezone: 'Asia/Tokyo', city: 'Tokyo', region: 'Asia' },
    ]);
  });

  it('matches multi-word cities typed with a space', () => {
    expect(searchTimeZones('new y', ZONES).map((m) => m.timezone)).toEqual(['America/New_York']);
  });

  it('ranks prefix matches before substring matches', () => {
    expect(searchTimeZones('to', ZONES).map((m) => m.city)).toEqual(['Tokyo', 'Toronto']);
    expect(searchTimeZones('on', ZONES).map((m) => m.city)).toEqual(['London', 'Toronto']);
  });

  it('ignores queries shorter than two characters', () => {
    expect(searchTimeZones('t', ZONES)).toEqual([]);
  });

  it('leaves out Etc and bare UTC zones', () => {
    expect(searchTimeZones('gmt', ZONES)).toEqual([]);
    expect(searchTimeZones('utc', ZONES)).toEqual([]);
  });

  it('searches the engine zone list by default', () => {
    expect(searchTimeZones('vilni').map((m) => m.timezone)).toEqual(['Europe/Vilnius']);
  });

  it('finds nothing offline on an engine without a zone list', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new TypeError('unsupported');
    });

    expect(searchTimeZones('tokyo')).toEqual([]);
  });
});

describe('addWorldClock', () => {
  it('appends a city with a trimmed label', () => {
    const zones = addWorldClock([], { label: '  Tokyo  ', timezone: 'Asia/Tokyo' });

    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ label: 'Tokyo', timezone: 'Asia/Tokyo' });
    expect(zones[0]?.id.length).toBeGreaterThan(0);
  });

  it('falls back to the city name for an empty label', () => {
    expect(addWorldClock([], { label: ' ', timezone: 'America/New_York' })[0]?.label).toBe(
      'New York'
    );
  });

  it('caps the label length', () => {
    const label = 'x'.repeat(40);

    expect(addWorldClock([], { label, timezone: 'Asia/Tokyo' })[0]?.label).toHaveLength(
      MAX_WORLD_CLOCK_LABEL
    );
  });

  it('ignores an exact duplicate', () => {
    expect(addWorldClock([TOKYO], { label: 'Tokyo', timezone: 'Asia/Tokyo' })).toEqual([TOKYO]);
  });

  it('keeps two labels in one zone', () => {
    expect(addWorldClock([AUSTIN], { label: 'Mom', timezone: 'America/Chicago' })).toHaveLength(2);
  });

  it('stops at the maximum', () => {
    const full = Array.from({ length: MAX_WORLD_CLOCKS }, (_, i) => ({
      ...TOKYO,
      id: `t${i}`,
      label: `T${i}`,
    }));

    expect(addWorldClock(full, { label: 'London', timezone: 'Europe/London' })).toBe(full);
  });
});

describe('world clock list edits', () => {
  it('removes by id', () => {
    expect(removeWorldClock([TOKYO, LONDON], 'tokyo')).toEqual([LONDON]);
  });

  it('moves a city up one place', () => {
    expect(moveWorldClockUp([TOKYO, LONDON, AUSTIN], 'austin')).toEqual([TOKYO, AUSTIN, LONDON]);
  });

  it('leaves the first city where it is', () => {
    expect(moveWorldClockUp([TOKYO, LONDON], 'tokyo')).toEqual([TOKYO, LONDON]);
  });

  it('renames, falling back to the city for a blank label', () => {
    expect(renameWorldClock([AUSTIN], 'austin', 'Mom')[0]?.label).toBe('Mom');
    expect(renameWorldClock([AUSTIN], 'austin', '  ')[0]?.label).toBe('Chicago');
  });
});

describe('shownWorldClocks', () => {
  it('shows at most the maximum, in order, from a longer synced list', () => {
    const many = Array.from({ length: MAX_WORLD_CLOCKS + 2 }, (_, i) => ({
      ...TOKYO,
      id: `t${i}`,
    }));

    expect(shownWorldClocks(many).map((zone) => zone.id)).toEqual(['t0', 't1', 't2', 't3']);
  });

  it('cuts an overlong synced label', () => {
    const [zone] = shownWorldClocks([{ ...TOKYO, label: 'x'.repeat(40) }]);

    expect(zone?.label).toHaveLength(MAX_WORLD_CLOCK_LABEL);
  });

  it('returns the same list when nothing needs cutting', () => {
    const zones = [TOKYO, LONDON];

    expect(shownWorldClocks(zones)).toBe(zones);
  });
});

describe('formatWallClockTime', () => {
  it('pads 24-hour times and has no period', () => {
    expect(formatWallClockTime(9, 5, '24h')).toEqual({ time: '09:05', period: '' });
  });

  it('shows midnight and noon as 12 in 12-hour format', () => {
    expect(formatWallClockTime(0, 30, '12h')).toEqual({ time: '12:30', period: 'AM' });
    expect(formatWallClockTime(12, 0, '12h')).toEqual({ time: '12:00', period: 'PM' });
  });
});
