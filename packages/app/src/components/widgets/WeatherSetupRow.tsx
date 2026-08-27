import type React from 'react';
import { useWeatherStore } from '../../stores/weather-store';
import { WeatherLocationPicker } from '../settings/WeatherLocationPicker';

/** Weather renders nothing without a location, so the picker must collect one inline. */
export const WeatherSetupRow: React.FC = () => {
  const location = useWeatherStore((state) => state.location);

  if (location !== null) {
    return null;
  }

  return (
    <div className="mt-2 ml-7">
      <p className="mb-1.5 text-xs text-tertiary">Pick a city to see your weather.</p>
      <WeatherLocationPicker />
    </div>
  );
};
