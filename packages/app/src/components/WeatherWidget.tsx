import {
  formatForecastHour,
  formatTemperature,
  formatWeatherAge,
  resolveWeatherUnits,
  sampleForecastHours,
  toLocalIso,
  type WeatherConditionKind,
  type WeatherSnapshot,
  type WeatherUnits,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { useWeatherStore } from '../stores/weather-store';

const DAY_ICONS: Record<WeatherConditionKind, React.ComponentType<{ className?: string }>> = {
  clear: Sun,
  'partly-cloudy': CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunderstorm: CloudLightning,
  unknown: Cloud,
};

function conditionIcon(
  condition: WeatherConditionKind,
  isDay: boolean
): React.ComponentType<{ className?: string }> {
  if (!isDay && condition === 'clear') {
    return Moon;
  }
  return DAY_ICONS[condition] ?? Cloud;
}

const CONDITION_LABELS: Record<WeatherConditionKind, string> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  thunderstorm: 'Thunderstorm',
  unknown: 'Unavailable',
};

const CHIP_CLASS =
  'flex items-center gap-1.5 rounded-full bg-surface/80 backdrop-blur-sm px-3 py-2.5 shadow-md hover:shadow-lg hover:scale-105 transition-all';

const WeatherPopover: React.FC<{ snapshot: WeatherSnapshot; alignRight: boolean }> = ({
  snapshot,
  alignRight,
}) => {
  const lastFetch = useWeatherStore((state) => state.lastFetch);
  const isLoading = useWeatherStore((state) => state.inFlight !== null);
  const error = useWeatherStore((state) => state.error);
  const refresh = useWeatherStore((state) => state.refresh);
  const unitsPreference = useSettingsStore((state) => state.settings.weatherUnits);
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);

  const { location, current } = snapshot;
  const Icon = conditionIcon(current.condition, current.isDay);
  const hours = sampleForecastHours(snapshot.hours, toLocalIso(new Date(), snapshot.timezone));
  const age = formatWeatherAge(lastFetch);

  return (
    <div
      className={cn(
        'absolute top-full mt-2 z-50 w-64 rounded-2xl border border-border bg-surface-elevated shadow-xl p-4',
        alignRight ? 'right-0' : 'left-0'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-xs text-secondary leading-snug">
          {location.name}
          {location.country ? `, ${location.country}` : ''}
        </span>
        <button
          type="button"
          onClick={() => refresh({ unitsPreference })}
          disabled={isLoading}
          title="Refresh weather"
          aria-label="Refresh weather"
          className="text-secondary hover:text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex items-center gap-3 pb-3 border-b border-divider">
        <Icon className="w-9 h-9 text-primary-600" />
        <div className="flex-1">
          <div className="text-3xl font-display font-bold text-primary leading-none">
            {formatTemperature(current.temperature)}
          </div>
          <div className="text-xs text-secondary mt-1">
            {CONDITION_LABELS[current.condition]}
            {current.apparentTemperature !== null &&
              ` · feels like ${formatTemperature(current.apparentTemperature)}`}
          </div>
        </div>
        <div className="text-right text-xs font-medium text-primary">
          <div>H {formatTemperature(snapshot.high)}</div>
          <div className="text-secondary">L {formatTemperature(snapshot.low)}</div>
        </div>
      </div>

      {hours.length > 0 && (
        <div className="flex justify-between pt-3">
          {hours.map((hour) => {
            const HourIcon = conditionIcon(hour.condition, hour.isDay);
            return (
              <div
                key={hour.time}
                className="text-center"
                data-testid={`hour-icon-${hour.isDay ? 'day' : 'moon'}`}
              >
                <div className="text-xs font-bold text-primary">
                  {formatTemperature(hour.temperature)}
                </div>
                <HourIcon className="w-3.5 h-3.5 mx-auto my-0.5 text-secondary" />
                <div className="text-[10px] text-secondary">
                  {formatForecastHour(hour.time, timeFormat)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(age !== null || error !== null) && (
        <div className="mt-3 pt-2 border-t border-divider text-[10px] text-secondary">
          {error ?? age}
        </div>
      )}
    </div>
  );
};

/**
 * Ambient weather chip for the new tab (ENG-18).
 *
 * Renders nothing without a location, and never blocks page render — weather must not
 * become a second ENG-77. Three states: a skeleton while the first reading loads, a retry
 * chip if that first reading failed, and the last good reading kept through any later
 * failure, with the error shown in the popover beside it.
 */
export const WeatherWidget: React.FC = () => {
  const showWeather = useSettingsStore((state) => state.settings.showWeather);
  const unitsPreference = useSettingsStore((state) => state.settings.weatherUnits);
  const position = useSettingsStore((state) => state.settings.weatherPosition);
  const location = useWeatherStore((state) => state.location);
  const snapshot = useWeatherStore((state) => state.snapshot);
  const error = useWeatherStore((state) => state.error);
  const isFetching = useWeatherStore((state) => state.inFlight !== null);
  const initialize = useWeatherStore((state) => state.initialize);
  const refresh = useWeatherStore((state) => state.refresh);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitsRef = useRef(unitsPreference);
  const requestedUnitsRef = useRef<WeatherUnits | null>(null);

  useEffect(() => {
    unitsRef.current = unitsPreference;
  }, [unitsPreference]);

  // Reads the preference off a ref so changing units doesn't re-run the storage load;
  // the effect below owns that case.
  useEffect(() => {
    if (showWeather) {
      initialize(unitsRef.current);
    }
  }, [showWeather, initialize]);

  // A reading is stored in whatever units it was fetched in, so changing the setting has
  // to refetch or the chip keeps showing the old scale. Each success replaces `snapshot`,
  // which re-runs this effect — so remember what was asked for, or a reply that doesn't
  // match (a proxy or provider fault) would refetch forever.
  useEffect(() => {
    const wanted = resolveWeatherUnits(unitsPreference);
    if (!showWeather || snapshot === null) {
      return;
    }
    if (snapshot.units === wanted) {
      // Back in sync, so forget what was asked for: a later mismatch is the user changing
      // their mind, not the reply-loop this guard exists to stop. Without this, a scale
      // whose refetch once failed could never be asked for again this page.
      requestedUnitsRef.current = null;
      return;
    }
    if (requestedUnitsRef.current === wanted) {
      return;
    }
    requestedUnitsRef.current = wanted;
    refresh({ silent: true, unitsPreference });
  }, [showWeather, snapshot, unitsPreference, refresh]);

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

  if (!showWeather || location === null) {
    return null;
  }

  if (snapshot === null) {
    // With nothing cached there is no popover to open, so the chip itself has to carry
    // the failure and the retry — otherwise a first fetch that fails leaves a pulsing
    // skeleton with no explanation, on every new tab, forever.
    if (error !== null && !isFetching) {
      return (
        <button
          type="button"
          onClick={() => refresh({ unitsPreference })}
          aria-label={`Weather unavailable: ${error}. Select to retry.`}
          title={error}
          className={CHIP_CLASS}
        >
          <CloudOff className="w-5 h-5 text-secondary" />
          <span className="text-sm font-medium text-secondary">Retry</span>
        </button>
      );
    }
    return (
      <div
        className={cn(CHIP_CLASS, 'animate-pulse')}
        aria-hidden="true"
        data-testid="weather-skeleton"
      >
        <span className="h-5 w-5 rounded-full bg-surface-variant" />
        <span className="h-3 w-8 rounded bg-surface-variant" />
      </div>
    );
  }

  // Read off the snapshot, not the preference: between a units change and its refetch
  // the two disagree, and the announced scale must match the number on screen.
  const units = snapshot.units;
  const Icon = conditionIcon(snapshot.current.condition, snapshot.current.isDay);
  const temperature = formatTemperature(snapshot.current.temperature);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Weather in ${location.name}: ${temperature}, ${CONDITION_LABELS[snapshot.current.condition]}`}
        title={`${location.name} · ${CONDITION_LABELS[snapshot.current.condition]}`}
        className={CHIP_CLASS}
      >
        <Icon className="w-5 h-5 text-primary-600" />
        <span className="text-sm font-bold text-primary tabular-nums">{temperature}</span>
        <span className="hidden sm:inline text-xs font-medium text-secondary">{location.name}</span>
        <span className="sr-only">{units === 'imperial' ? 'Fahrenheit' : 'Celsius'}</span>
      </button>

      {isOpen && <WeatherPopover snapshot={snapshot} alignRight={position === 'right'} />}
    </div>
  );
};
