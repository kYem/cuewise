import { Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Blocks } from 'lucide-react';
import type React from 'react';
import { useId, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useWeatherStore } from '../../stores/weather-store';
import { WidgetPicker } from './WidgetPicker';
import { offeredHomeWidgets } from './widget-catalog';

export const AddWidgetChip: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings);
  const settingsLoading = useSettingsStore((state) => state.isLoading);
  const weatherLocation = useWeatherStore((state) => state.location);
  const weatherInitialized = useWeatherStore((state) => state.initialized);
  const [isOpen, setIsOpen] = useState(false);
  const headingId = useId();

  // A flag is not a widget: weather without a city renders nothing, and this chip is the
  // only inline route back to the city search.
  const everyWidgetDelivers = offeredHomeWidgets().every((widget) => {
    if (widget.key === 'showWeather') {
      return settings.showWeather && weatherLocation !== null;
    }
    return settings[widget.key];
  });

  // Weather's store hydrates separately, so deciding before it lands would flash the chip at
  // someone whose city is already saved.
  const awaitingWeather = settings.showWeather && !weatherInitialized;

  if (settingsLoading) {
    return null;
  }

  // Both reasons to hide are at-rest only — vanishing mid-gesture would drop the user's focus
  // to the document, and enabling weather from the open panel is exactly that.
  if ((everyWidgetDelivers || awaitingWeather) && !isOpen) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Add a widget" title="Add a widget" className="home-tile">
          <Blocks className="w-5 h-5 text-primary-600" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={headingId}
        className="max-h-[70vh] w-80 overflow-y-auto p-2"
      >
        <h3
          id={headingId}
          className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary"
        >
          Add to your home screen
        </h3>
        <WidgetPicker />
      </PopoverContent>
    </Popover>
  );
};
