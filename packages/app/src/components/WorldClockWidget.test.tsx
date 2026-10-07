import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROKEN_ZONE,
  HOME_ZONE,
  MONDAY_NOON_UTC,
  mockWorldClockSettings,
  NEW_YORK_ZONE,
  TOKYO_ZONE,
} from './__fixtures__/world-clock.fixtures';
import { WorldClockWidget } from './WorldClockWidget';

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

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: /world clock/i }));
  return screen.getByRole('dialog', { name: 'World clock' });
}

describe('WorldClockWidget', () => {
  it('renders nothing while the world clock is off', () => {
    mockWorldClockSettings({ showWorldClock: false });
    const { container } = render(<WorldClockWidget />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without any cities', () => {
    mockWorldClockSettings({ worldClocks: [] });
    const { container } = render(<WorldClockWidget />);

    expect(container).toBeEmptyDOMElement();
  });

  it('gives way to the line under the big clock when the clock is on', () => {
    mockWorldClockSettings({ showClock: true });
    const { container } = render(<WorldClockWidget />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the first city's time on the chip", () => {
    mockWorldClockSettings();
    render(<WorldClockWidget />);

    const chip = screen.getByRole('button', { name: /world clock/i });
    expect(chip).toHaveTextContent('Tokyo');
    expect(chip).toHaveTextContent('21:00');
  });

  it('counts the other cities on the chip', () => {
    mockWorldClockSettings({ worldClocks: [TOKYO_ZONE, NEW_YORK_ZONE] });
    render(<WorldClockWidget />);

    expect(screen.getByRole('button', { name: /world clock/i })).toHaveTextContent('+1');
  });

  it('shows at most four cities from a longer synced list', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...TOKYO_ZONE, id: `t${i}` }));
    mockWorldClockSettings({ worldClocks: many });
    render(<WorldClockWidget />);

    expect(screen.getByRole('button', { name: /world clock/i })).toHaveTextContent('+3');
    expect(within(openPopover()).getAllByText('Tokyo')).toHaveLength(4);
  });

  it('follows the 12-hour setting', () => {
    mockWorldClockSettings({ timeFormat: '12h' });
    render(<WorldClockWidget />);

    expect(screen.getByRole('button', { name: /world clock/i })).toHaveTextContent('9:00 PM');
  });

  it('lists your own zone and each city with its difference from you', () => {
    mockWorldClockSettings({ worldClocks: [TOKYO_ZONE, NEW_YORK_ZONE] });
    render(<WorldClockWidget />);

    const dialog = openPopover();
    expect(within(dialog).getByText('London (you)')).toBeInTheDocument();
    expect(within(dialog).getByText('+8h')).toBeInTheDocument();
    expect(within(dialog).getByText('−5h')).toBeInTheDocument();
    expect(within(dialog).getByText('08:00')).toBeInTheDocument();
  });

  it('marks night and working hours on each row', () => {
    mockWorldClockSettings();
    render(<WorldClockWidget />);

    const tokyo = within(openPopover()).getByTestId(`world-clock-row-${TOKYO_ZONE.id}`);
    expect(within(tokyo).getByText('Night')).toBeInTheDocument();
    expect(within(tokyo).getByText('Off hours')).toBeInTheDocument();
  });

  it('shows a zone this browser cannot read as unavailable and keeps the rest', () => {
    mockWorldClockSettings({ worldClocks: [TOKYO_ZONE, BROKEN_ZONE] });
    render(<WorldClockWidget />);

    const dialog = openPopover();
    const broken = within(dialog).getByTestId(`world-clock-row-${BROKEN_ZONE.id}`);
    expect(within(broken).getByText('Unavailable')).toBeInTheDocument();
    expect(within(dialog).getByText('+8h')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    mockWorldClockSettings();
    render(<WorldClockWidget />);
    openPopover();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'World clock' })).not.toBeInTheDocument();
  });
});
