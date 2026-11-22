import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { TOKYO_ZONE } from '../__fixtures__/world-clock.fixtures';
import {
  HOME_WIDGETS,
  type HomeWidget,
  type HomeWidgetKey,
  isWidgetShowing,
  offeredHomeWidgets,
} from './widget-catalog';

function catalogued(key: HomeWidgetKey): HomeWidget {
  const widget = HOME_WIDGETS.find((w) => w.key === key);
  if (widget === undefined) {
    throw new Error(`no catalog entry for ${key}`);
  }
  return widget;
}

describe('HOME_WIDGETS', () => {
  it('lists every home widget exactly once', () => {
    const keys = HOME_WIDGETS.map((w) => w.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every widget copy the picker can render', () => {
    for (const widget of HOME_WIDGETS) {
      expect(widget.label.length).toBeGreaterThan(0);
      expect(widget.help.length).toBeGreaterThan(0);
      expect(widget.keywords.length).toBeGreaterThan(0);
    }
  });

  it('follows weather between the two corners it can occupy', () => {
    const weather = HOME_WIDGETS.find((w) => w.key === 'showWeather');

    expect(weather).toBeDefined();
    expect(weather?.where({ ...DEFAULT_SETTINGS, weatherPosition: 'left' })).toBe('Top left');
    expect(weather?.where({ ...DEFAULT_SETTINGS, weatherPosition: 'right' })).toBe('Top right');
  });

  it('follows the world clock between corners, and under the big clock when that is on', () => {
    const worldClock = HOME_WIDGETS.find((w) => w.key === 'showWorldClock');

    expect(worldClock?.where({ ...DEFAULT_SETTINGS, worldClockPosition: 'left' })).toBe('Top left');
    expect(worldClock?.where({ ...DEFAULT_SETTINGS, worldClockPosition: 'right' })).toBe(
      'Top right'
    );
    expect(worldClock?.where({ ...DEFAULT_SETTINGS, showClock: true })).toBe('Center');
  });

  it('sends clock and calendar to the center column', () => {
    const center = HOME_WIDGETS.filter((w) => w.where(DEFAULT_SETTINGS) === 'Center');

    expect(center.map((w) => w.key)).toEqual(['showClock', 'newTabShowCalendar']);
  });
});

describe('offeredHomeWidgets', () => {
  it('offers the calendar on a build that can actually render it', () => {
    const keys = offeredHomeWidgets(true).map((w) => w.key);

    expect(keys).toContain('newTabShowCalendar');
  });

  it('withholds the calendar on a build without an OAuth client id, where it is a dead switch', () => {
    const keys = offeredHomeWidgets(false).map((w) => w.key);

    expect(keys).toEqual(
      HOME_WIDGETS.map((w) => w.key).filter((key) => key !== 'newTabShowCalendar')
    );
  });
});

describe('isWidgetShowing', () => {
  const world = { hasWeatherLocation: true };

  it.each(HOME_WIDGETS.map((widget) => [widget.label, widget] as const))(
    'draws nothing while %s is switched off',
    (_label, widget) => {
      expect(isWidgetShowing(widget, { ...DEFAULT_SETTINGS, [widget.key]: false }, world)).toBe(
        false
      );
    }
  );

  it('does not count weather as showing until it has a city', () => {
    const on = { ...DEFAULT_SETTINGS, showWeather: true };

    expect(isWidgetShowing(catalogued('showWeather'), on, { hasWeatherLocation: false })).toBe(
      false
    );
    expect(isWidgetShowing(catalogued('showWeather'), on, world)).toBe(true);
  });

  it('does not count the world clock as showing until it has a city', () => {
    const on = { ...DEFAULT_SETTINGS, showWorldClock: true };

    expect(isWidgetShowing(catalogued('showWorldClock'), { ...on, worldClocks: [] }, world)).toBe(
      false
    );
    expect(
      isWidgetShowing(catalogued('showWorldClock'), { ...on, worldClocks: [TOKYO_ZONE] }, world)
    ).toBe(true);
  });
});
