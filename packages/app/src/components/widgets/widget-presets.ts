import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { isCalendarFeatureEnabled } from '../../utils/google-calendar';
import {
  type HomeWidget,
  type HomeWidgetKey,
  offeredHomeWidgets,
  type WidgetPatch,
} from './widget-catalog';

function patchFrom(
  widgets: readonly HomeWidget[],
  value: (key: HomeWidgetKey) => boolean
): WidgetPatch {
  const patch: WidgetPatch = {};
  for (const widget of widgets) {
    patch[widget.key] = value(widget.key);
  }
  return patch;
}

export interface WidgetPreset {
  id: 'minimal' | 'recommended' | 'everything';
  label: string;
  patch: WidgetPatch;
}

// Takes the gate rather than a widget list, so no caller can hand it the raw catalog and
// manufacture a preset that switches on something this build hides.
export function widgetPresets(
  featureEnabled: boolean = isCalendarFeatureEnabled()
): readonly WidgetPreset[] {
  const widgets = offeredHomeWidgets(featureEnabled);
  return [
    { id: 'minimal', label: 'Minimal', patch: patchFrom(widgets, () => false) },
    {
      id: 'recommended',
      label: 'Recommended',
      patch: patchFrom(widgets, (key) => DEFAULT_SETTINGS[key]),
    },
    { id: 'everything', label: 'Everything', patch: patchFrom(widgets, () => true) },
  ];
}
