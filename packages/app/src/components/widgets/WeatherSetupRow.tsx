import type React from 'react';
import { needsWeatherCity, useWeatherStore } from '../../stores/weather-store';
import { WeatherLocationPicker } from '../settings/WeatherLocationPicker';

/**
 * Weather renders nothing without a location, so the picker must collect one inline — and stay
 * put afterwards, or choosing the wrong city would unmount the only control that could fix it.
 */
export const WeatherSetupRow: React.FC = () => {
  const needsCity = useWeatherStore(needsWeatherCity);
  const initialized = useWeatherStore((state) => state.initialized);

  if (!initialized) {
    return null;
  }

  return (
    <div className="mt-2 ml-7">
      {needsCity && (
        <p className="mb-1.5 text-xs text-tertiary">Pick a city to see your weather.</p>
      )}
      <WeatherLocationPicker />
    </div>
  );
};
