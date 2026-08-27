import { DEFAULT_SETTINGS } from '@cuewise/shared';
import type { HomeWidgetKey } from './widget-catalog';

type WidgetPatch = Record<HomeWidgetKey, boolean>;

function allWidgets(value: boolean): WidgetPatch {
  return {
    showClock: value,
    showQuickLinks: value,
    showNotes: value,
    showWeather: value,
    newTabShowCalendar: value,
  };
}

export interface WidgetPreset {
  id: 'minimal' | 'recommended' | 'everything';
  label: string;
  patch: WidgetPatch;
}

export const WIDGET_PRESETS: readonly WidgetPreset[] = [
  { id: 'minimal', label: 'Minimal', patch: allWidgets(false) },
  {
    id: 'recommended',
    label: 'Recommended',
    patch: {
      showClock: DEFAULT_SETTINGS.showClock,
      showQuickLinks: DEFAULT_SETTINGS.showQuickLinks,
      showNotes: DEFAULT_SETTINGS.showNotes,
      showWeather: DEFAULT_SETTINGS.showWeather,
      newTabShowCalendar: DEFAULT_SETTINGS.newTabShowCalendar,
    },
  },
  { id: 'everything', label: 'Everything', patch: allWidgets(true) },
];
