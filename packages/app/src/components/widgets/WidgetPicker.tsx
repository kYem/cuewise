import type React from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { Switch } from '../settings/SettingControls';
import { HOME_WIDGETS, type HomeWidget, widgetPatch } from './widget-catalog';

interface WidgetPickerProps {
  showPresets?: boolean;
}

// `as const satisfies` keeps each entry's literal shape, so members without `setup` lack the
// property entirely; widen back to the interface (satisfies already proved this assignable).
const widgets: readonly HomeWidget[] = HOME_WIDGETS;

export const WidgetPicker: React.FC<WidgetPickerProps> = () => {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <div className="space-y-1">
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
