import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONDON, VILNIUS } from '../../stores/__fixtures__/weather-store.fixtures';
import { mockSettings, mockWeatherStore } from '../__fixtures__/weather-widget.fixtures';
import { WeatherLocationPicker } from './WeatherLocationPicker';

vi.mock('../../stores/weather-store', () => ({ useWeatherStore: vi.fn() }));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockSettings();
  mockWeatherStore({ location: null, snapshot: null });
});

afterEach(() => {
  vi.useRealTimers();
});

function type(value: string): void {
  fireEvent.change(screen.getByLabelText('Search for a city'), { target: { value } });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('searching', () => {
  it('does not search until the debounce elapses', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);
    type('lond');
    advance(299);

    expect(store.search).not.toHaveBeenCalled();
  });

  it('searches once the debounce elapses', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);
    type('lond');
    advance(300);

    expect(store.search).toHaveBeenCalledWith('lond');
  });

  // Typing four characters must cost one lookup, not four — the rate limit is per IP.
  it('issues a single lookup for a burst of keystrokes', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);
    type('l');
    advance(100);
    type('lo');
    advance(100);
    type('lon');
    advance(100);
    type('lond');
    advance(300);

    expect(store.search).toHaveBeenCalledTimes(1);
    expect(store.search).toHaveBeenCalledWith('lond');
  });

  it('never sends a query below the minimum length', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);
    type('l');
    advance(1000);

    expect(store.search).not.toHaveBeenCalled();
    expect(store.clearSearch).toHaveBeenCalled();
  });

  it('trims the query before searching', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);
    type('  lond  ');
    advance(300);

    expect(store.search).toHaveBeenCalledWith('lond');
  });

  it('cancels a pending lookup when the field is cleared', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);
    type('lond');
    advance(100);
    type('');
    advance(1000);

    expect(store.search).not.toHaveBeenCalled();
  });

  it('does not fire a pending lookup after unmount', () => {
    const store = mockWeatherStore({ location: null, snapshot: null });

    const { unmount } = render(<WeatherLocationPicker />);
    type('lond');
    advance(100);
    unmount();
    advance(1000);

    expect(store.search).not.toHaveBeenCalled();
  });
});

describe('results', () => {
  it('lists each place with enough detail to disambiguate duplicates', () => {
    mockWeatherStore({ location: null, snapshot: null, searchResults: [LONDON, VILNIUS] });

    render(<WeatherLocationPicker />);

    expect(screen.getByText('London, England, United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('Vilnius, Vilnius, Lithuania')).toBeInTheDocument();
  });

  it('sets the picked place along with the units preference', () => {
    mockSettings({ showWeather: true, weatherUnits: 'imperial' });
    const store = mockWeatherStore({ location: null, snapshot: null, searchResults: [VILNIUS] });

    render(<WeatherLocationPicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Vilnius, Vilnius, Lithuania' }));

    expect(store.setLocation).toHaveBeenCalledWith(VILNIUS, 'imperial');
  });

  it('surfaces a search failure instead of an empty list', () => {
    mockWeatherStore({
      location: null,
      snapshot: null,
      searchError: 'Too many weather requests; try again in a moment',
    });

    render(<WeatherLocationPicker />);

    expect(
      screen.getByText('Too many weather requests; try again in a moment')
    ).toBeInTheDocument();
  });

  it('shows a spinner while a lookup is running', () => {
    mockWeatherStore({ location: null, snapshot: null, isSearching: true });

    render(<WeatherLocationPicker />);
    type('lond');

    expect(screen.queryByText('No places found.')).not.toBeInTheDocument();
  });

  it('reports an empty result set once the lookup settles', () => {
    mockWeatherStore({ location: null, snapshot: null, searchResults: [] });

    render(<WeatherLocationPicker />);
    type('zzzz');

    expect(screen.getByText('No places found.')).toBeInTheDocument();
  });
});

describe('the chosen place', () => {
  it('is not shown before one is picked', () => {
    mockWeatherStore({ location: null, snapshot: null });

    render(<WeatherLocationPicker />);

    expect(screen.queryByRole('button', { name: 'Remove location' })).not.toBeInTheDocument();
  });

  it('is shown once set', () => {
    mockWeatherStore({ location: VILNIUS });

    render(<WeatherLocationPicker />);

    expect(screen.getByText('Vilnius, Vilnius, Lithuania')).toBeInTheDocument();
  });

  it('can be removed', () => {
    const store = mockWeatherStore({ location: LONDON });

    render(<WeatherLocationPicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove location' }));

    expect(store.clearLocation).toHaveBeenCalledTimes(1);
  });
});
