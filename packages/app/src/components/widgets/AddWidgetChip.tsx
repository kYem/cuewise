import { Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { WidgetPicker } from './WidgetPicker';
import { HOME_WIDGETS } from './widget-catalog';

export const AddWidgetChip: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings);
  const [isOpen, setIsOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);
  const everyWidgetOn = HOME_WIDGETS.every((widget) => settings[widget.key]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(event.target as Node)) {
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

  if (everyWidgetOn) {
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
        <Plus className="h-5 w-5 text-primary" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Add a widget"
          className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-surface-elevated p-2 shadow-xl animate-fade-in"
        >
          <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary">
            Add to your home screen
          </h3>
          <WidgetPicker />
        </div>
      )}
    </div>
  );
};
