import type { WeatherLocation } from '@cuewise/shared';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useWeatherStore } from '../../stores/weather-store';
import { describeLocation, MIN_SEARCH_QUERY_LENGTH } from '../../utils/weather';

/** Long enough that typing a city name is one lookup, short enough to feel instant. */
const DEBOUNCE_MS = 300;

const INPUT_CLASS =
  'w-full pl-9 pr-9 py-2 text-sm bg-surface-variant border border-border rounded-lg text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary-500/40';

export const WeatherLocationPicker: React.FC = () => {
  const location = useWeatherStore((state) => state.location);
  const results = useWeatherStore((state) => state.searchResults);
  const isSearching = useWeatherStore((state) => state.isSearching);
  const searchError = useWeatherStore((state) => state.searchError);
  const search = useWeatherStore((state) => state.search);
  const clearSearch = useWeatherStore((state) => state.clearSearch);
  const setLocation = useWeatherStore((state) => state.setLocation);
  const clearLocation = useWeatherStore((state) => state.clearLocation);
  const unitsPreference = useSettingsStore((state) => state.settings.weatherUnits);

  const [query, setQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      clearSearch();
      return;
    }
    timerRef.current = setTimeout(() => {
      search(trimmed);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query, search, clearSearch]);

  const handleSelect = async (place: WeatherLocation) => {
    setQuery('');
    await setLocation(place, unitsPreference);
  };

  const handleClear = async () => {
    setQuery('');
    await clearLocation();
  };

  const showEmptyState =
    query.trim().length >= MIN_SEARCH_QUERY_LENGTH &&
    !isSearching &&
    searchError === null &&
    results.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {location !== null && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-variant">
          <span className="flex items-center gap-2 text-sm text-primary min-w-0">
            <MapPin className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <span className="truncate">{describeLocation(location)}</span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            aria-label="Remove location"
            className="text-secondary hover:text-primary transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={location === null ? 'Search for a city' : 'Change location'}
          aria-label="Search for a city"
          className={INPUT_CLASS}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary animate-spin" />
        )}
      </div>

      {searchError !== null && <p className="text-xs text-error">{searchError}</p>}

      {showEmptyState && <p className="text-xs text-secondary">No places found.</p>}

      {results.length > 0 && (
        <ul className="flex flex-col rounded-lg border border-border overflow-hidden">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => handleSelect(place)}
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-variant transition-colors"
              >
                {describeLocation(place)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
