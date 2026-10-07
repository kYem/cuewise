import {
  addWorldClock,
  MAX_WORLD_CLOCK_LABEL,
  MAX_WORLD_CLOCKS,
  moveWorldClockUp,
  removeWorldClock,
  renameWorldClock,
  type WorldClockZone,
} from '@cuewise/shared';
import { ArrowUp, X } from 'lucide-react';
import type React from 'react';
import { WorldClockCityPicker } from './WorldClockCityPicker';

const ICON_BUTTON_CLASS =
  'p-1 rounded text-secondary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

export const WorldClockSettings: React.FC<{
  zones: WorldClockZone[];
  onChange: (zones: WorldClockZone[]) => void;
}> = ({ zones, onChange }) => (
  <div className="flex flex-col gap-2">
    {zones.map((zone, index) => (
      <div
        key={zone.id}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg border-2 border-divider"
      >
        <div className="flex-1 min-w-0">
          <input
            key={zone.label}
            type="text"
            defaultValue={zone.label}
            maxLength={MAX_WORLD_CLOCK_LABEL}
            aria-label={`Label for ${zone.label}`}
            onBlur={(event) => {
              if (event.target.value !== zone.label) {
                onChange(renameWorldClock(zones, zone.id, event.target.value));
              }
            }}
            className="w-full bg-transparent text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary-500/40 rounded px-1"
          />
          <div className="px-1 text-xs text-tertiary truncate">{zone.timezone}</div>
        </div>
        <button
          type="button"
          onClick={() => onChange(moveWorldClockUp(zones, zone.id))}
          disabled={index === 0}
          aria-label={`Move ${zone.label} up`}
          className={ICON_BUTTON_CLASS}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(removeWorldClock(zones, zone.id))}
          aria-label={`Remove ${zone.label}`}
          className={ICON_BUTTON_CLASS}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ))}
    {zones.length < MAX_WORLD_CLOCKS ? (
      <WorldClockCityPicker onSelect={(pick) => onChange(addWorldClock(zones, pick))} />
    ) : (
      <p className="text-xs text-tertiary">Up to {MAX_WORLD_CLOCKS} cities.</p>
    )}
  </div>
);
