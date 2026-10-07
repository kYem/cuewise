import { addWorldClock } from '@cuewise/shared';
import type React from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { WorldClockCityPicker } from '../settings/WorldClockCityPicker';

/** The world clock shows nothing without a city, so the picker collects the first one inline. */
export const WorldClockSetupRow: React.FC = () => {
  const zones = useSettingsStore((state) => state.settings.worldClocks);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  if (zones.length > 0) {
    return null;
  }

  return (
    <div className="mt-2 ml-7">
      <p className="mb-1.5 text-xs text-tertiary">Add a city to see its time.</p>
      <WorldClockCityPicker
        onSelect={(pick) => updateSettings({ worldClocks: addWorldClock(zones, pick) })}
      />
    </div>
  );
};
