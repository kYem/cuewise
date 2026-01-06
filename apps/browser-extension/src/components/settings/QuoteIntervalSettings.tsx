import type { FocusPosition, QuoteDisplayMode } from '@cuewise/shared';
import { RefreshCw } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';
import { SettingsToggle } from './SettingsToggle';

const QUOTE_DISPLAY_OPTIONS: Record<QuoteDisplayMode, string> = {
  normal: 'Normal (top)',
  compact: 'Compact (top)',
  bottom: 'Fixed at bottom',
  hidden: 'Hidden',
};

const FOCUS_POSITION_OPTIONS: Record<FocusPosition, string> = {
  top: 'Top',
  center: 'Center',
  bottom: 'Bottom',
};

interface QuoteIntervalSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

const PRESET_INTERVALS = [
  { value: 0, label: 'Manual' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 1800, label: '30m' },
  { value: 3600, label: '1h' },
];

/**
 * Format interval for display.
 */
function formatInterval(seconds: number): string {
  if (seconds === 0) {
    return 'Manual';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Quote Change Interval settings section.
 * Handles auto-refresh interval for quotes.
 */
export const QuoteIntervalSettings: React.FC<QuoteIntervalSettingsProps> = ({ form, setField }) => {
  const interval = form.quoteChangeInterval;

  const isHidden = form.quoteDisplayMode === 'hidden';

  return (
    <SettingsSection icon={RefreshCw} title="Quote Settings">
      {/* Quote display mode */}
      <SettingsSelect
        id="quote-display-mode"
        label="Quote Display"
        value={form.quoteDisplayMode}
        options={QUOTE_DISPLAY_OPTIONS}
        onChange={(value) => setField('quoteDisplayMode', value as QuoteDisplayMode)}
        description="Control how quotes are displayed on the home page"
      />

      {/* Focus position - only show when quote is bottom or hidden */}
      {(form.quoteDisplayMode === 'bottom' || form.quoteDisplayMode === 'hidden') && (
        <SettingsSelect
          id="focus-position"
          label="Focus Position"
          value={form.focusPosition}
          options={FOCUS_POSITION_OPTIONS}
          onChange={(value) => setField('focusPosition', value as FocusPosition)}
          description="Vertical position of the focus/goals section"
        />
      )}

      {/* Only show interval settings when quotes are visible */}
      {!isHidden && (
        <>
          {/* Current interval display */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="block text-sm font-medium text-primary">
              Current interval:{' '}
              <span className="text-primary-600 font-semibold">{formatInterval(interval)}</span>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div>
            <p className="text-xs text-secondary mb-2">Quick presets:</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_INTERVALS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setField('quoteChangeInterval', preset.value)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    interval === preset.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom interval slider and input */}
          {interval > 0 && (
            <div>
              <label
                htmlFor="quote-interval"
                className="block text-sm font-medium text-primary mb-2"
              >
                Custom interval (10s - 1h):
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="quote-interval"
                  type="range"
                  min="10"
                  max="3600"
                  step="1"
                  value={interval}
                  onChange={(e) => setField('quoteChangeInterval', Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={interval}
                  onChange={(e) => setField('quoteChangeInterval', Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-xs text-secondary w-8">sec</span>
              </div>
            </div>
          )}

          <p className="text-xs text-secondary">
            {interval === 0
              ? 'Quotes will only change when you click the refresh button'
              : `Quotes will automatically change every ${formatInterval(interval).toLowerCase()}`}
          </p>

          {/* Animation toggle */}
          <div className="pt-4 border-t border-border">
            <SettingsToggle
              id="quote-animation"
              label="Animate quote transitions"
              description="Slot-machine style animation when quotes change"
              checked={form.enableQuoteAnimation}
              onChange={(checked) => setField('enableQuoteAnimation', checked)}
            />
          </div>
        </>
      )}
    </SettingsSection>
  );
};
