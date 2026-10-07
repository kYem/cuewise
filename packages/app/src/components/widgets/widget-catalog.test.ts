import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { HOME_WIDGETS, offeredHomeWidgets } from './widget-catalog';

describe('HOME_WIDGETS', () => {
  it('lists every home widget exactly once', () => {
    const keys = HOME_WIDGETS.map((w) => w.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'showClock',
      'showQuickLinks',
      'showNotes',
      'showWeather',
      'showWorldClock',
      'newTabShowCalendar',
    ]);
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

    expect(keys).toEqual([
      'showClock',
      'showQuickLinks',
      'showNotes',
      'showWeather',
      'showWorldClock',
    ]);
  });
});
