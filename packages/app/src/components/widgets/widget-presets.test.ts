import { describe, expect, it } from 'vitest';
import { WIDGET_PRESETS } from './widget-presets';

function preset(id: string) {
  return WIDGET_PRESETS.find((p) => p.id === id);
}

describe('WIDGET_PRESETS', () => {
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
});
