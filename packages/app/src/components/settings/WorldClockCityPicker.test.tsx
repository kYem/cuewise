import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchLocations } from '../../utils/weather';
import { AUSTIN_PLACE, KOLKATA_PLACE, TOKYO_PLACE } from '../__fixtures__/world-clock.fixtures';
import { WorldClockCityPicker } from './WorldClockCityPicker';

vi.mock('../../utils/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/weather')>()),
  searchLocations: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(searchLocations).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

function type(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search for a city' }), {
    target: { value: text },
  });
}

async function finishOnlineSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('WorldClockCityPicker', () => {
  it('shows offline zone matches before the online search runs', () => {
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('tokyo');

    expect(screen.getByRole('button', { name: /Tokyo/ })).toBeInTheDocument();
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it('adds online places once the search lands', async () => {
    vi.mocked(searchLocations).mockResolvedValue([AUSTIN_PLACE]);
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('austin');
    await finishOnlineSearch();

    expect(searchLocations).toHaveBeenCalledWith('austin');
    expect(
      screen.getByRole('button', { name: /Austin, Texas, United States/ })
    ).toBeInTheDocument();
  });

  it('lists a city once when both searches find it', async () => {
    vi.mocked(searchLocations).mockResolvedValue([TOKYO_PLACE]);
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('tokyo');
    await finishOnlineSearch();

    expect(screen.getAllByRole('button', { name: /Tokyo/ })).toHaveLength(1);
  });

  it('lists a renamed city once when the two searches use different zone ids', async () => {
    vi.mocked(searchLocations).mockResolvedValue([KOLKATA_PLACE]);
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('kolkata');
    await finishOnlineSearch();

    expect(screen.getAllByRole('button', { name: /Kolkata/ })).toHaveLength(1);
  });

  it('keeps offline matches quietly when the online search fails', async () => {
    vi.mocked(searchLocations).mockRejectedValue(new Error('offline'));
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('tokyo');
    await finishOnlineSearch();

    expect(screen.getByRole('button', { name: /Tokyo/ })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't search online/i)).not.toBeInTheDocument();
  });

  it('explains a failed online search when nothing offline matched', async () => {
    vi.mocked(searchLocations).mockRejectedValue(new Error('offline'));
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('austin');
    await finishOnlineSearch();

    expect(screen.getByText("Couldn't search online. Check your connection.")).toBeInTheDocument();
  });

  it('says so when neither search finds a place', async () => {
    render(<WorldClockCityPicker onSelect={vi.fn()} />);

    type('qqqzz');
    await finishOnlineSearch();

    expect(screen.getByText('No places found.')).toBeInTheDocument();
  });

  it('hands back the city name and zone, then clears the search', async () => {
    vi.mocked(searchLocations).mockResolvedValue([AUSTIN_PLACE]);
    const onSelect = vi.fn();
    render(<WorldClockCityPicker onSelect={onSelect} />);

    type('austin');
    await finishOnlineSearch();
    fireEvent.click(screen.getByRole('button', { name: /Austin, Texas/ }));

    expect(onSelect).toHaveBeenCalledWith({ label: 'Austin', timezone: 'America/Chicago' });
    expect(screen.getByRole('textbox', { name: 'Search for a city' })).toHaveValue('');
  });
});
