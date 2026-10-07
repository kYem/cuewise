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
import { useRef } from 'react';
import { WorldClockCityPicker } from './WorldClockCityPicker';

const ICON_BUTTON_CLASS =
  'p-1 rounded text-secondary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

export const WorldClockSettings: React.FC<{
  zones: WorldClockZone[];
  onChange: (zones: WorldClockZone[]) => void;
}> = ({ zones, onChange }) => {
  // Saves land asynchronously, so a second edit before the first comes back as `zones` must
  // build on the first, not on the stale prop.
  const pending = useRef(zones);
  const seen = useRef(zones);
  if (seen.current !== zones) {
    seen.current = zones;
    pending.current = zones;
  }
  const commit = (edit: (current: WorldClockZone[]) => WorldClockZone[]) => {
    pending.current = edit(pending.current);
    onChange(pending.current);
  };
  const rename = (id: string, label: string) => {
    if (pending.current.find((zone) => zone.id === id)?.label === label) {
      return;
    }
    commit((current) => renameWorldClock(current, id, label));
  };

  return (
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
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  rename(zone.id, event.currentTarget.value);
                }
                if (event.key === 'Escape') {
                  event.currentTarget.value = zone.label;
                }
              }}
              onBlur={(event) => rename(zone.id, event.target.value)}
              className="w-full bg-transparent text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary-500/40 rounded px-1"
            />
            <div className="px-1 text-xs text-tertiary truncate">{zone.timezone}</div>
          </div>
          <button
            type="button"
            onClick={() => commit((current) => moveWorldClockUp(current, zone.id))}
            disabled={index === 0}
            aria-label={`Move ${zone.label} up`}
            className={ICON_BUTTON_CLASS}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => commit((current) => removeWorldClock(current, zone.id))}
            aria-label={`Remove ${zone.label}`}
            className={ICON_BUTTON_CLASS}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      {zones.length < MAX_WORLD_CLOCKS ? (
        <WorldClockCityPicker
          onSelect={(pick) => commit((current) => addWorldClock(current, pick))}
        />
      ) : (
        <p className="text-xs text-tertiary">Up to {MAX_WORLD_CLOCKS} cities.</p>
      )}
    </div>
  );
};
