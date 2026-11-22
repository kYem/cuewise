import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { ALL_WIDGETS_ON } from '../__fixtures__/widget-picker.fixtures';
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
  it('catalogues each widget key once', () => {
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
    const weather = catalogued('showWeather');

    expect(weather.where({ ...DEFAULT_SETTINGS, weatherPosition: 'left' })).toBe('Top left');
    expect(weather.where({ ...DEFAULT_SETTINGS, weatherPosition: 'right' })).toBe('Top right');
  });

  it('follows the world clock between corners, and under the big clock when that is on', () => {
    const worldClock = catalogued('showWorldClock');

    expect(worldClock.where({ ...DEFAULT_SETTINGS, worldClockPosition: 'left' })).toBe('Top left');
    expect(worldClock.where({ ...DEFAULT_SETTINGS, worldClockPosition: 'right' })).toBe(
      'Top right'
    );
    expect(worldClock.where({ ...DEFAULT_SETTINGS, showClock: true })).toBe('Center');
  });

  it.each(['showClock', 'newTabShowCalendar'] as const)('sends %s to the center column', (key) => {
    expect(catalogued(key).where(DEFAULT_SETTINGS)).toBe('Center');
  });

  it.each(['showQuickLinks', 'showNotes'] as const)('keeps %s in the top left', (key) => {
    expect(catalogued(key).where(DEFAULT_SETTINGS)).toBe('Top left');
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

  // From a state where everything draws, so each case fails only on its own switch.
  const allShowing = { ...DEFAULT_SETTINGS, ...ALL_WIDGETS_ON };

  it.each(HOME_WIDGETS.map((widget) => [widget.label, widget] as const))(
    'counts %s as showing exactly while its switch is on',
    (_label, widget) => {
      expect(isWidgetShowing(widget, allShowing, world)).toBe(true);
      expect(isWidgetShowing(widget, { ...allShowing, [widget.key]: false }, world)).toBe(false);
    }
  );

  it('does not count weather as showing until it has a city', () => {
    const noCity = { hasWeatherLocation: false };

    expect(isWidgetShowing(catalogued('showWeather'), allShowing, noCity)).toBe(false);
  });

  it('does not count the world clock as showing until it has a city', () => {
    const noCities = { ...allShowing, worldClocks: [] };

    expect(isWidgetShowing(catalogued('showWorldClock'), noCities, world)).toBe(false);
  });
});
