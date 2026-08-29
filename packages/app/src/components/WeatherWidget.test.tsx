import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hours, LONDON, snapshot } from '../stores/__fixtures__/weather-store.fixtures';
import { mockSettings, mockWeatherStore } from './__fixtures__/weather-widget.fixtures';
import { WeatherWidget } from './WeatherWidget';

vi.mock('../stores/weather-store', () => ({ useWeatherStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSettings();
  mockWeatherStore();
});

describe('visibility', () => {
  it('renders nothing when the setting is off', () => {
    mockSettings({ showWeather: false });

    const { container } = render(<WeatherWidget />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no location has been chosen', () => {
    mockWeatherStore({ location: null, snapshot: null });

    const { container } = render(<WeatherWidget />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not initialize the store while the setting is off', () => {
    mockSettings({ showWeather: false });
    const store = mockWeatherStore();

    render(<WeatherWidget />);

    expect(store.initialize).not.toHaveBeenCalled();
  });

  it('initializes the store when enabled', () => {
    const store = mockWeatherStore();

    render(<WeatherWidget />);

    expect(store.initialize).toHaveBeenCalledTimes(1);
  });

  it('passes the units preference into initialize', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    const store = mockWeatherStore();

    render(<WeatherWidget />);

    expect(store.initialize).toHaveBeenCalledWith('imperial');
  });
});

describe('units changes', () => {
  it('refetches when the setting no longer matches the cached reading', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    const store = mockWeatherStore();

    render(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledWith({ silent: true, unitsPreference: 'imperial' });
  });

  it('does not refetch when the reading already uses the chosen units', () => {
    mockSettings({ showWeather: true, weatherUnits: 'metric' });
    const store = mockWeatherStore();

    render(<WeatherWidget />);

    expect(store.refresh).not.toHaveBeenCalled();
  });

  // Every success replaces the snapshot and re-runs the effect, so a reply that never
  // matches must not turn into an unbounded retry against our own proxy.
  it('asks only once when the reply keeps coming back in the wrong units', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });

    const { rerender } = render(<WeatherWidget />);
    store.snapshot = snapshot(LONDON, { units: 'metric' });
    rerender(<WeatherWidget />);
    store.snapshot = snapshot(LONDON, { units: 'metric' });
    rerender(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  // The widget is opt-in, so a units mismatch must not reach the network while it is off.
  it('does not refetch while weather is switched off', () => {
    mockSettings({ showWeather: false, weatherUnits: 'imperial' });
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });

    render(<WeatherWidget />);

    expect(store.refresh).not.toHaveBeenCalled();
  });

  it('announces the scale the number is actually in, not the pending preference', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });

    render(<WeatherWidget />);

    expect(screen.getByRole('button', { name: /weather in/i })).toHaveAccessibleName(
      expect.stringContaining('Celsius')
    );
  });
});

describe('the chip', () => {
  it('shows a skeleton rather than blocking while the first reading loads', () => {
    mockWeatherStore({ snapshot: null });

    render(<WeatherWidget />);

    expect(screen.getByTestId('weather-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the temperature and the place', () => {
    render(<WeatherWidget />);

    expect(screen.getByText('17°')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
  });

  it('hides the city name below the sm breakpoint', () => {
    render(<WeatherWidget />);

    expect(screen.getByText('London')).toHaveClass('hidden', 'sm:inline');
  });

  it('describes itself for screen readers', () => {
    render(<WeatherWidget />);

    expect(
      screen.getByRole('button', { name: /weather in london: 17° celsius, clear/i })
    ).toBeInTheDocument();
  });

  it('keeps showing a cached reading when the last refresh failed', () => {
    mockWeatherStore({ error: 'The weather service is unavailable right now' });

    render(<WeatherWidget />);

    expect(screen.getByText('17°')).toBeInTheDocument();
  });
});

describe('the popover', () => {
  function open(): void {
    fireEvent.click(screen.getByRole('button', { name: /weather in london/i }));
  }

  it('stays closed until the chip is clicked', () => {
    render(<WeatherWidget />);

    expect(screen.queryByText(/feels like/i)).not.toBeInTheDocument();
  });

  it('is the dialog the chip promises', () => {
    render(<WeatherWidget />);
    open();

    expect(screen.getByRole('dialog', { name: /weather/i })).toBeInTheDocument();
  });

  it('shows current conditions', () => {
    render(<WeatherWidget />);

    open();

    expect(screen.getByText(/clear · feels like 15°/i)).toBeInTheDocument();
    expect(screen.getByText('H 21°')).toBeInTheDocument();
    expect(screen.getByText('L 11°')).toBeInTheDocument();
  });

  it('shows how old the reading is', () => {
    mockWeatherStore({ lastFetch: new Date(Date.now() - 8 * 60_000).toISOString() });

    render(<WeatherWidget />);
    open();

    expect(screen.getByText('Updated 8 min ago')).toBeInTheDocument();
  });

  it('shows the error in place of the age when a refresh failed', () => {
    mockWeatherStore({ error: 'The weather service is unavailable right now' });

    render(<WeatherWidget />);
    open();

    expect(screen.getByText('The weather service is unavailable right now')).toBeInTheDocument();
  });

  it('refreshes on demand', () => {
    // Pin the scale: under an en-US locale 'auto' resolves imperial and the units effect
    // would fire a second, unrelated refresh.
    mockSettings({ showWeather: true, weatherUnits: 'metric' });
    const store = mockWeatherStore();

    render(<WeatherWidget />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh weather' }));

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh control while a fetch is running', () => {
    mockWeatherStore({ isFetching: true });

    render(<WeatherWidget />);
    open();

    expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeDisabled();
  });

  it('closes on Escape', () => {
    render(<WeatherWidget />);
    open();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText(/feels like/i)).not.toBeInTheDocument();
  });

  it('closes on a click outside', () => {
    render(<WeatherWidget />);
    open();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText(/feels like/i)).not.toBeInTheDocument();
  });

  it('aligns to the right edge when the chip sits in the right cluster', () => {
    mockSettings({ showWeather: true, weatherPosition: 'right' });

    render(<WeatherWidget />);
    open();

    expect(screen.getByText(/feels like/i).closest('div.absolute')).toHaveClass('right-0');
  });

  it('aligns to the left edge when the chip sits in the left cluster', () => {
    mockSettings({ showWeather: true, weatherPosition: 'left' });

    render(<WeatherWidget />);
    open();

    expect(screen.getByText(/feels like/i).closest('div.absolute')).toHaveClass('left-0');
  });

  it('omits the hourly row once the day is over', () => {
    const past = snapshot(LONDON, {
      hours: [{ time: '1999-01-01T01:00', temperature: 5, condition: 'clear', isDay: false }],
    });
    mockWeatherStore({ snapshot: past });

    render(<WeatherWidget />);
    open();

    expect(screen.queryByText('5°')).not.toBeInTheDocument();
  });
});

describe('a scale whose refetch failed', () => {
  // The guard above must not outlive the mismatch it was armed for: without clearing it,
  // one failed imperial fetch made imperial unrequestable for the life of the page.
  it('can be asked for again after switching away and back', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });

    const { rerender } = render(<WeatherWidget />);
    expect(store.refresh).toHaveBeenCalledTimes(1);

    // The refetch failed, so the cached reading is still metric — which the user goes back to.
    mockSettings({ showWeather: true, weatherUnits: 'metric' });
    rerender(<WeatherWidget />);

    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    rerender(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledTimes(2);
    // Still the user's doing the second time: bookkeeping that skips a pass which returned
    // early would silently downgrade every change after the first.
    expect(store.refresh).toHaveBeenLastCalledWith({ silent: false, unitsPreference: 'imperial' });
  });
});

describe('the forecast strip', () => {
  // Far enough ahead that the "rest of today" filter keeps it whenever the suite runs.
  const FUTURE_HOUR = {
    time: '2099-01-01T15:00',
    temperature: 18,
    condition: 'clear',
    isDay: true,
  } as const;

  it('labels hours in the 12-hour clock by default', () => {
    mockSettings({ showWeather: true, timeFormat: '12h' });
    mockWeatherStore({ snapshot: snapshot(LONDON, { hours: [FUTURE_HOUR] }) });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('3 PM')).toBeInTheDocument();
  });

  it('labels hours in the 24-hour clock when that is the setting', () => {
    mockSettings({ showWeather: true, timeFormat: '24h' });
    mockWeatherStore({ snapshot: snapshot(LONDON, { hours: [FUTURE_HOUR] }) });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('15')).toBeInTheDocument();
  });
});

describe("the popover's high and low", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function openAt(now: string, overrides: Parameters<typeof snapshot>[1]): void {
    vi.setSystemTime(new Date(now));
    mockWeatherStore({ snapshot: snapshot(LONDON, { timezone: 'UTC', ...overrides }) });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button', { name: /weather in london/i }));
  }

  it("rolls over to tomorrow's once the reading has no hours of today left", () => {
    openAt('2026-07-25T23:30:00Z', {
      hours: [...hours('2026-07-25'), ...hours('2026-07-26')],
      tomorrow: { high: 26, low: 14 },
    });

    expect(screen.getByText('H 26°')).toBeInTheDocument();
    expect(screen.getByText('L 14°')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it("stays on today's while the strip still shows hours of today", () => {
    openAt('2026-07-25T21:30:00Z', {
      hours: [...hours('2026-07-25'), ...hours('2026-07-26')],
      tomorrow: { high: 26, low: 14 },
    });

    expect(screen.getByText('H 21°')).toBeInTheDocument();
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();
  });

  // A reading cached before the proxy sent tomorrow, or one from a proxy that still doesn't.
  it("stays on today's when the reading carries no tomorrow", () => {
    openAt('2026-07-25T23:30:00Z', {
      hours: [...hours('2026-07-25'), ...hours('2026-07-26')],
    });

    expect(screen.getByText('H 21°')).toBeInTheDocument();
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();
  });
});

describe('an incomplete reading', () => {
  it('omits "feels like" rather than repeating the current temperature', () => {
    const reading = snapshot(LONDON);
    mockWeatherStore({
      snapshot: { ...reading, current: { ...reading.current, apparentTemperature: null } },
    });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText(/feels like/)).not.toBeInTheDocument();
  });
});

// This whole branch could be deleted with the suite green, and it is the branch that
// stops a failed first fetch leaving a pulsing skeleton on every new tab forever.
describe('a first reading that never arrived', () => {
  it('offers a retry instead of an endless skeleton', () => {
    mockWeatherStore({ snapshot: null, error: 'The weather service is unavailable right now' });

    render(<WeatherWidget />);

    expect(screen.getByRole('button', { name: /weather unavailable/i })).toBeInTheDocument();
    expect(screen.queryByTestId('weather-skeleton')).not.toBeInTheDocument();
  });

  it('retries when that control is used', () => {
    mockSettings({ showWeather: true, weatherUnits: 'metric' });
    const store = mockWeatherStore({ snapshot: null, error: 'Could not update the weather' });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button', { name: /weather unavailable/i }));

    expect(store.refresh).toHaveBeenCalledWith({ unitsPreference: 'metric' });
  });

  // While a retry is running there is nothing to report yet, so the skeleton is right.
  it('shows the skeleton again while the retry is in flight', () => {
    mockWeatherStore({ snapshot: null, error: 'Could not update the weather', isFetching: true });

    render(<WeatherWidget />);

    expect(screen.getByTestId('weather-skeleton')).toBeInTheDocument();
  });
});

describe('the hourly icons', () => {
  // Scoped to the strip, and asserted on the icon lucide actually rendered: the chip has
  // its own icon, and a testid derived from `hour.isDay` would pass even with the day/night
  // choice deleted, since it reads the very input the choice consumes.
  function stripIcons(): string {
    return screen.getByTestId('forecast-strip').innerHTML;
  }

  it('draw night hours as night, not as a sun after sunset', () => {
    const night = {
      time: '2099-01-01T22:00',
      temperature: 12,
      condition: 'clear' as const,
      isDay: false,
    };
    mockWeatherStore({ snapshot: snapshot(LONDON, { hours: [night] }) });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button', { name: /weather in london/i }));

    expect(stripIcons()).toContain('lucide-moon');
    expect(stripIcons()).not.toContain('lucide-sun');
  });

  it('draw daylight hours as daylight', () => {
    const day = {
      time: '2099-01-01T14:00',
      temperature: 19,
      condition: 'clear' as const,
      isDay: true,
    };
    mockWeatherStore({ snapshot: snapshot(LONDON, { hours: [day] }) });

    render(<WeatherWidget />);
    fireEvent.click(screen.getByRole('button', { name: /weather in london/i }));

    expect(stripIcons()).toContain('lucide-sun');
    expect(stripIcons()).not.toContain('lucide-moon');
  });
});

describe('a units change the user just made', () => {
  // setLocation — the other action in the same settings panel — toasts on failure. A silent
  // refetch here leaves the settings reading °F while the chip still shows °C, with the
  // only evidence buried in a popover the user has no reason to open.
  it('is refetched loudly, so a failure is not swallowed', () => {
    mockSettings({ showWeather: true, weatherUnits: 'metric' });
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });

    const { rerender } = render(<WeatherWidget />);
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    rerender(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledWith({ silent: false, unitsPreference: 'imperial' });
  });

  // A mismatch that was already on disk at mount is nobody's action, so it stays quiet.
  it('is distinguished from a mismatch that was there on mount', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });

    render(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledWith({ silent: true, unitsPreference: 'imperial' });
  });
});

describe('a units change made before any reading is on screen', () => {
  // Choosing a city nulls the snapshot; changing the scale in the same breath must not be
  // downgraded to silent just because the pass that saw it had nothing to do yet.
  it('is still the users own change once the reading lands', () => {
    mockSettings({ showWeather: true, weatherUnits: 'metric' });
    mockWeatherStore({ snapshot: null });

    const { rerender } = render(<WeatherWidget />);
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    rerender(<WeatherWidget />);
    // Captured from the call that supplies the landed reading — the earlier mock's spy is
    // replaced, so asserting on it would pass without the widget doing anything.
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });
    rerender(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledWith({ silent: false, unitsPreference: 'imperial' });
  });

  // Settings hydration flips showWeather and the scale together on a fresh tab. Treating
  // that as a user action would toast on every new tab whose fetch happened to fail.
  it('does not count settings hydration as a user action', () => {
    mockSettings({ showWeather: false, weatherUnits: 'auto' });
    mockWeatherStore({ snapshot: null });

    const { rerender } = render(<WeatherWidget />);
    const store = mockWeatherStore({ snapshot: snapshot(LONDON, { units: 'metric' }) });
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    rerender(<WeatherWidget />);

    expect(store.refresh).toHaveBeenCalledWith({ silent: true, unitsPreference: 'imperial' });
  });
});
