import type { Settings } from '@cuewise/shared';
import { Calendar, Clock, CloudSun, LayoutGrid, NotebookPen } from 'lucide-react';
import type React from 'react';
import { isCalendarFeatureEnabled } from '../../utils/google-calendar';
import { WeatherSetupRow } from './WeatherSetupRow';

export type HomeWidgetKey = Extract<
  keyof Settings,
  'showClock' | 'showQuickLinks' | 'showNotes' | 'showWeather' | 'newTabShowCalendar'
>;

export interface HomeWidget {
  key: HomeWidgetKey;
  label: string;
  help: string;
  keywords: string;
  icon: React.ReactNode;
  where: (s: Settings) => 'Top left' | 'Top right' | 'Centre';
  setup?: React.FC;
}

const iconClass = 'w-4 h-4 text-primary-600 dark:text-primary-400';

export const HOME_WIDGETS = [
  {
    key: 'showClock',
    label: 'Clock',
    help: 'Time, date, and greeting on the home page',
    keywords: 'time date greeting show format 12 24',
    icon: <Clock className={iconClass} />,
    where: () => 'Centre',
  },
  {
    key: 'showQuickLinks',
    label: 'Quick links',
    help: 'Pinned shortcut tiles in the top-left of the home page',
    keywords: 'shortcut bookmark favicon links tiles pinned sites',
    icon: <LayoutGrid className={iconClass} />,
    where: () => 'Top left',
  },
  {
    key: 'showNotes',
    label: 'Notes',
    help: 'A scratchpad in the top-left of the home page, kept on this device unless Cloud Sync is on',
    keywords: 'notes scratchpad jot memo text note pad reminder scribble',
    icon: <NotebookPen className={iconClass} />,
    where: () => 'Top left',
  },
  {
    key: 'showWeather',
    label: 'Weather',
    help: "Current conditions and today's forecast, fetched through Cuewise's own proxy",
    keywords: 'weather temperature forecast rain sun location city climate',
    icon: <CloudSun className={iconClass} />,
    where: (s) => (s.weatherPosition === 'left' ? 'Top left' : 'Top right'),
    setup: WeatherSetupRow,
  },
  {
    key: 'newTabShowCalendar',
    label: 'Calendar',
    help: 'A strip of your upcoming events on the home page',
    keywords: 'calendar events agenda schedule upcoming strip',
    icon: <Calendar className={iconClass} />,
    where: () => 'Centre',
  },
] as const satisfies readonly HomeWidget[];

// The widgets this build can actually render, so no surface offers a switch that does nothing.
// Folds the build-time calendar gate the same way calendar-visibility.ts does; `featureEnabled`
// defaults to the live gate and is passed explicitly in tests.
export function offeredHomeWidgets(
  featureEnabled: boolean = isCalendarFeatureEnabled()
): readonly HomeWidget[] {
  if (featureEnabled) {
    return HOME_WIDGETS;
  }
  return HOME_WIDGETS.filter((widget) => widget.key !== 'newTabShowCalendar');
}

// A computed key from a union widens to string, so the annotation is what keeps this
// assignable to Partial<Settings>. Both the picker and Settings write through it.
export function widgetPatch(key: HomeWidgetKey, value: boolean): Partial<Settings> {
  return { [key]: value };
}

type UncataloguedKey = Exclude<HomeWidgetKey, (typeof HOME_WIDGETS)[number]['key']>;
export const _everyWidgetIsCatalogued: UncataloguedKey extends never ? true : never = true;
