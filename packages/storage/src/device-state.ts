import {
  type CalendarState,
  type CalendarStateEnvelope,
  calendarEventSchema,
  calendarStateEnvelopeSchema,
  logger,
  type PostureDailyStat,
  postureDailyStatSchema,
  STORAGE_KEYS,
  type WeatherState,
} from '@cuewise/shared';
import {
  getFromStorage,
  getValidatedFromStorage,
  getValidatedListFromStorage,
  type StorageResult,
  setInStorage,
  setValidatedListInStorage,
} from './chrome-storage';

// Posture daily rollups (macOS tracking; always local — device-specific data)
export async function getPostureStats(): Promise<PostureDailyStat[]> {
  const stats = await getValidatedListFromStorage<PostureDailyStat>(
    STORAGE_KEYS.POSTURE_STATS,
    postureDailyStatSchema,
    'local'
  );
  return stats ?? [];
}

export async function setPostureStats(stats: PostureDailyStat[]): Promise<StorageResult> {
  return setValidatedListInStorage(
    STORAGE_KEYS.POSTURE_STATS,
    stats,
    postureDailyStatSchema,
    'local'
  );
}

// Google Calendar (connection + cached events; always local)
export async function getCalendarState(): Promise<CalendarState | null> {
  const stored = await getValidatedFromStorage<CalendarStateEnvelope>(
    STORAGE_KEYS.CALENDAR,
    calendarStateEnvelopeSchema,
    'local'
  );
  if (stored === null) {
    return null;
  }
  // Events are filtered per item: one stale cached row must not cost `connected`, which the
  // store cannot recover without sending the user back through Google's consent screen.
  const events = stored.events.filter(
    (event) => calendarEventSchema.safeParse(event).success
  ) as CalendarState['events'];
  if (events.length === stored.events.length) {
    return { ...stored, events };
  }
  logger.warn('Dropped unreadable cached calendar events', {
    dropped: stored.events.length - events.length,
    of: stored.events.length,
  });
  // `lastSync` goes too, or the store reads it as `syncedToday`, skips its refetch and shows
  // the gaps as the user's agenda for the rest of the day.
  return { ...stored, events, lastSync: null };
}

export async function setCalendarState(state: CalendarState): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.CALENDAR, state, 'local');
}

// Always local, which is what makes the location per-device: a travelling laptop shows
// where it actually is.
export async function getWeatherState(): Promise<WeatherState | null> {
  // Raw: `weather-store.initialize` salvages the location separately from the reading,
  // and validating the wrapper here would take the saved city with a bad reading.
  return getFromStorage<WeatherState>(STORAGE_KEYS.WEATHER, 'local');
}

export async function setWeatherState(state: WeatherState): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.WEATHER, state, 'local');
}
