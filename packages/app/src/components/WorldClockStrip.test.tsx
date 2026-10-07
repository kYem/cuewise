import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUCKLAND_ZONE,
  BROKEN_ZONE,
  HOME_ZONE,
  MONDAY_NOON_UTC,
  mockWorldClockSettings,
  TOKYO_ZONE,
} from './__fixtures__/world-clock.fixtures';
import { WorldClockStrip } from './WorldClockStrip';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('@cuewise/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cuewise/shared')>()),
  deviceTimeZone: () => HOME_ZONE,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MONDAY_NOON_UTC);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WorldClockStrip', () => {
  it('lists each city with its time', () => {
    mockWorldClockSettings();
    render(<WorldClockStrip />);

    const strip = screen.getByRole('list', { name: 'World clock' });
    expect(strip).toHaveTextContent('Tokyo');
    expect(strip).toHaveTextContent('21:00');
  });

  it('tags a city already on the next day', () => {
    mockWorldClockSettings({ worldClocks: [AUCKLAND_ZONE] });
    render(<WorldClockStrip />);

    expect(screen.getByRole('list', { name: 'World clock' })).toHaveTextContent('Tomorrow');
  });

  it('leaves out a zone this browser cannot read', () => {
    mockWorldClockSettings({ worldClocks: [TOKYO_ZONE, BROKEN_ZONE] });
    render(<WorldClockStrip />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders nothing while the world clock is off', () => {
    mockWorldClockSettings({ showWorldClock: false });
    const { container } = render(<WorldClockStrip />);

    expect(container).toBeEmptyDOMElement();
  });
});
