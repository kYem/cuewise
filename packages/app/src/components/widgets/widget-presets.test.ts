import { describe, expect, it } from 'vitest';
import { widgetPresets } from './widget-presets';

function preset(id: string, featureEnabled = true) {
  return widgetPresets(featureEnabled).find((p) => p.id === id);
}

describe('widgetPresets', () => {
  it('turns everything off for minimal', () => {
    expect(preset('minimal')?.patch).toEqual({
      showClock: false,
      showQuickLinks: false,
      showNotes: false,
      showWeather: false,
      newTabShowCalendar: false,
    });
  });

  it('matches the shipped defaults for recommended', () => {
    expect(preset('recommended')?.patch).toEqual({
      showClock: false,
      showQuickLinks: true,
      showNotes: true,
      showWeather: false,
      newTabShowCalendar: false,
    });
  });

  it('turns everything on for everything', () => {
    expect(preset('everything')?.patch).toEqual({
      showClock: true,
      showQuickLinks: true,
      showNotes: true,
      showWeather: true,
      newTabShowCalendar: true,
    });
  });

  it.each([
    'minimal',
    'recommended',
    'everything',
  ])('leaves the calendar key out of %s on a build that cannot render it', (id) => {
    expect(preset(id, false)?.patch).not.toHaveProperty('newTabShowCalendar');
  });

  it('still writes the four remaining widgets when the calendar is not offered', () => {
    expect(preset('everything', false)?.patch).toEqual({
      showClock: true,
      showQuickLinks: true,
      showNotes: true,
      showWeather: true,
    });
  });
});
