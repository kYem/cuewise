import type React from 'react';
import { needsWeatherCity, useWeatherStore } from '../../stores/weather-store';
import { WeatherLocationPicker } from '../settings/WeatherLocationPicker';

/** Weather renders nothing without a location, so the picker collects one inline and stays put. */
export const WeatherSetupRow: React.FC = () => {
  const needsCity = useWeatherStore(needsWeatherCity);
  const initialized = useWeatherStore((state) => state.initialized);

  // Blank until the mounted WeatherWidget's initialize() lands, or the picker would flash
  // "no city" at someone whose city is already on disk.
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
