import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LONDON, snapshot } from '../stores/__fixtures__/weather-store.fixtures';
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
      screen.getByRole('button', { name: /weather in london: 17°, clear/i })
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
    const store = mockWeatherStore();

    render(<WeatherWidget />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh weather' }));

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh control while a fetch is running', () => {
    mockWeatherStore({ isLoading: true });

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
      hours: [{ time: '1999-01-01T01:00', temperature: 5, condition: 'clear' }],
    });
    mockWeatherStore({ snapshot: past });

    render(<WeatherWidget />);
    open();

    expect(screen.queryByText('5°')).not.toBeInTheDocument();
  });
});
