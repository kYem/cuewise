import { cn } from '@cuewise/ui';
import type React from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { Switch } from '../settings/SettingControls';
import { offeredHomeWidgets, widgetPatch } from './widget-catalog';
import { matchesPreset, widgetPresets } from './widget-presets';

interface WidgetPickerProps {
  showPresets?: boolean;
}

export const WidgetPicker: React.FC<WidgetPickerProps> = ({ showPresets = false }) => {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const widgets = offeredHomeWidgets();

  return (
    <div className="space-y-1">
      {showPresets && (
        <div className="mb-2 flex gap-1.5">
          {widgetPresets().map((preset) => {
            const active = matchesPreset(settings, preset.patch);

            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  void updateSettings(preset.patch);
                }}
                className={cn(
                  'flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-transparent bg-primary-600 text-white'
                    : 'border-border bg-surface text-secondary hover:bg-surface-variant hover:text-primary'
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}
      {widgets.map((widget) => {
        const enabled = settings[widget.key];
        const Setup = widget.setup;

        return (
          <div key={widget.key} className="rounded-lg px-2 py-2 hover:bg-surface-variant">
            <div className="flex items-center gap-3">
              {widget.icon}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">{widget.label}</p>
                <p className="text-xs text-secondary">{widget.help}</p>
              </div>
              <span className="flex-shrink-0 text-xs text-tertiary">{widget.where(settings)}</span>
              <Switch
                label={widget.label}
                checked={enabled}
                onChange={(checked) => {
                  void updateSettings(widgetPatch(widget.key, checked));
                }}
              />
            </div>
            {enabled && Setup !== undefined && <Setup />}
          </div>
        );
      })}
    </div>
  );
};
