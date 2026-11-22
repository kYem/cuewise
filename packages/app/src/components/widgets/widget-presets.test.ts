import { DEFAULT_SETTINGS } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { HOME_WIDGETS } from './widget-catalog';
import { widgetPresets } from './widget-presets';

function preset(id: string, featureEnabled = true) {
  return widgetPresets(featureEnabled).find((p) => p.id === id);
}

function patchOf(value: (key: (typeof HOME_WIDGETS)[number]['key']) => boolean) {
  return Object.fromEntries(HOME_WIDGETS.map((widget) => [widget.key, value(widget.key)]));
}

describe('widgetPresets', () => {
  it('turns every widget off for minimal', () => {
    expect(preset('minimal')?.patch).toEqual(patchOf(() => false));
  });

  it('matches the shipped defaults for recommended', () => {
    expect(preset('recommended')?.patch).toEqual(patchOf((key) => DEFAULT_SETTINGS[key]));
  });

  it('turns every widget on for everything', () => {
    expect(preset('everything')?.patch).toEqual(patchOf(() => true));
  });

  it.each(['minimal', 'recommended', 'everything'])(
    'leaves the calendar key out of %s on a build that cannot render it',
    (id) => {
      expect(preset(id, false)?.patch).not.toHaveProperty('newTabShowCalendar');
    }
  );

  it('still writes the remaining widgets when the calendar is not offered', () => {
    const { newTabShowCalendar: _calendar, ...rest } = patchOf(() => true);

    expect(preset('everything', false)?.patch).toEqual(rest);
  });
});
