import { Blocks } from 'lucide-react';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const chipRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // A flag is not a widget: weather without a city renders nothing, and this chip is the
  // only inline route back to the city search.
  const everyWidgetDelivers = offeredHomeWidgets().every((widget) => {
    if (widget.key === 'showWeather') {
      return settings.showWeather && weatherLocation !== null;
    }
    return settings[widget.key];
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = chipRef.current?.contains(target) ?? false;
      const clickedPanel = panelRef.current?.contains(target) ?? false;
      if (!clickedTrigger && !clickedPanel) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

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
    <div ref={chipRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Add a widget"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Add a widget"
        className="home-tile"
      >
        <Blocks className="w-5 h-5 text-primary-600" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={headingId}
            className="fixed z-[100] max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-border bg-surface-elevated p-2 shadow-xl animate-fade-in"
            style={{
              top: (chipRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
              left: chipRef.current?.getBoundingClientRect().left ?? 0,
            }}
          >
            <h3
              id={headingId}
              className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary"
            >
              Add to your home screen
            </h3>
            <WidgetPicker />
          </div>,
          document.body
        )}
    </div>
  );
};
