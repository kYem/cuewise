import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { HOME_WIDGETS } from './widget-catalog';

describe('HOME_WIDGETS', () => {
  it('lists every home widget exactly once', () => {
    const keys = HOME_WIDGETS.map((w) => w.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'showClock',
      'showQuickLinks',
      'showNotes',
      'showWeather',
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

  it('sends clock and calendar to the centre column', () => {
    const centre = HOME_WIDGETS.filter((w) => w.where(DEFAULT_SETTINGS) === 'Centre');

    expect(centre.map((w) => w.key)).toEqual(['showClock', 'newTabShowCalendar']);
  });
});
