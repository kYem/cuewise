import { searchTimeZones, type WeatherLocation } from '@cuewise/shared';
import { Loader2, Search } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { describeLocation, MIN_SEARCH_QUERY_LENGTH, searchLocations } from '../../utils/weather';

const DEBOUNCE_MS = 300;

const INPUT_CLASS =
  'w-full pl-9 pr-9 py-2 text-sm bg-surface-variant border border-border rounded-lg text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary-500/40';

export interface CityPick {
  label: string;
  timezone: string;
}

interface Option extends CityPick {
  key: string;
  text: string;
}

type OnlineState =
  | { status: 'idle' }
  | { status: 'searching'; query: string }
  | { status: 'done'; query: string; places: WeatherLocation[] }
  | { status: 'failed'; query: string };

/**
 * City search for the world clock. The engine's own zone list answers instantly and offline; the
 * weather geocoder adds every other town when it can be reached. Its own state, not the weather
 * store's, so the weather picker on the same screen keeps its results.
 */
export const WorldClockCityPicker: React.FC<{ onSelect: (pick: CityPick) => void }> = ({
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<OnlineState>({ status: 'idle' });
  const generation = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      setOnline({ status: 'idle' });
      return;
    }
    const timer = setTimeout(() => {
      setOnline({ status: 'searching', query: trimmed });
      searchLocations(trimmed).then(
        (places) => {
          if (generation.current === mine) {
            setOnline({ status: 'done', query: trimmed, places });
          }
        },
        () => {
          if (generation.current === mine) {
            setOnline({ status: 'failed', query: trimmed });
          }
        }
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [trimmed]);

  const options = useMemo<Option[]>(() => {
    const offline = searchTimeZones(trimmed).map((match) => ({
      key: match.timezone,
      text: `${match.city} · ${match.region}`,
      label: match.city,
      timezone: match.timezone,
    }));
    if (online.status !== 'done' || online.query !== trimmed) {
      return offline;
    }
    const fresh = online.places
      .filter(
        (place) =>
          !offline.some((match) => match.timezone === place.timezone && match.label === place.name)
      )
      .map((place) => ({
        key: `place-${place.id}`,
        text: describeLocation(place),
        label: place.name,
        timezone: place.timezone,
      }));
    return [...offline, ...fresh];
  }, [trimmed, online]);

  const settledForQuery =
    (online.status === 'done' || online.status === 'failed') && online.query === trimmed;
  const isSearching = online.status === 'searching' && online.query === trimmed;
  const showFailure = settledForQuery && online.status === 'failed' && options.length === 0;
  const showEmpty = settledForQuery && online.status === 'done' && options.length === 0;

  const handleSelect = (option: Option) => {
    setQuery('');
    onSelect({ label: option.label, timezone: option.timezone });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Add a city"
          aria-label="Search for a city"
          className={INPUT_CLASS}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary animate-spin" />
        )}
      </div>

      {showFailure && (
        <p className="text-xs text-error">Couldn't search online. Check your connection.</p>
      )}
      {showEmpty && <p className="text-xs text-secondary">No places found.</p>}

      {options.length > 0 && (
        <ul className="flex flex-col rounded-lg border border-border overflow-hidden">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => handleSelect(option)}
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-variant transition-colors"
              >
                {option.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
