import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { type HomeWidget, type HomeWidgetKey, offeredHomeWidgets } from './widget-catalog';

type WidgetPatch = Partial<Record<HomeWidgetKey, boolean>>;

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

// Built from the offered widgets so a preset can never switch on something this build hides.
export function widgetPresets(
  widgets: readonly HomeWidget[] = offeredHomeWidgets()
): readonly WidgetPreset[] {
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
