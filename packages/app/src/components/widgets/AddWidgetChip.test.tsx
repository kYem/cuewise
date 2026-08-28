import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCalendarFeatureEnabled } from '../../utils/google-calendar';
import {
  ALL_WIDGETS_OFF,
  ALL_WIDGETS_ON,
  mockWidgetPickerStores,
} from '../__fixtures__/widget-picker.fixtures';
import { AddWidgetChip } from './AddWidgetChip';

vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../stores/weather-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stores/weather-store')>()),
  useWeatherStore: vi.fn(),
}));
vi.mock('../../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn() }));
vi.mock('../settings/WeatherLocationPicker', () => ({
  WeatherLocationPicker: () => <div data-testid="location-picker" />,
}));

describe('AddWidgetChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCalendarFeatureEnabled).mockReturnValue(true);
  });

  it('offers itself while any widget is still off', () => {
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    expect(screen.getByRole('button', { name: 'Add a widget' })).toBeInTheDocument();
  });

  it('renders nothing once every widget is on, so it never becomes clutter', () => {
    mockWidgetPickerStores({ settings: ALL_WIDGETS_ON });
    const { container } = render(<AddWidgetChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays available while weather is on without a city, since that widget draws nothing', () => {
    mockWidgetPickerStores({ settings: ALL_WIDGETS_ON, hasWeatherLocation: false });
    render(<AddWidgetChip />);

    expect(screen.getByRole('button', { name: 'Add a widget' })).toBeInTheDocument();
  });

  it('closes when the trigger is clicked a second time', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    await user.click(screen.getByRole('button', { name: 'Add a widget' }));

    expect(screen.queryByRole('checkbox', { name: 'Clock' })).not.toBeInTheDocument();
  });

  it('survives enabling weather from its own open panel, before the store has hydrated', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({
      settings: { ...ALL_WIDGETS_ON, showWeather: false },
      hasWeatherLocation: false,
      weatherInitialized: false,
    });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    await user.click(screen.getByRole('checkbox', { name: 'Weather' }));

    expect(screen.getByRole('checkbox', { name: 'Weather' })).toBeInTheDocument();
  });

  it('waits for the weather store before deciding, so a saved city never flashes the chip', () => {
    mockWidgetPickerStores({
      settings: ALL_WIDGETS_ON,
      hasWeatherLocation: false,
      weatherInitialized: false,
    });
    const { container } = render(<AddWidgetChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stops offering itself when the only widget left off is one this build cannot render', () => {
    vi.mocked(isCalendarFeatureEnabled).mockReturnValue(false);
    mockWidgetPickerStores({ settings: { ...ALL_WIDGETS_ON, newTabShowCalendar: false } });
    const { container } = render(<AddWidgetChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it('waits for settings to load, so a fully configured home screen never flashes it', () => {
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF, isLoading: true });
    const { container } = render(<AddWidgetChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens the picker without presets', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));

    expect(screen.getByRole('checkbox', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Minimal' })).not.toBeInTheDocument();
  });

  it('portals the panel out, since the row it sits in fades away on scroll', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    const { container } = render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));

    expect(container).not.toContainElement(screen.getByRole('dialog'));
  });

  it('stays open when the panel itself is clicked', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    fireEvent.mouseDown(screen.getByRole('dialog'));

    expect(screen.getByRole('checkbox', { name: 'Clock' })).toBeInTheDocument();
  });

  it('names its popover after the heading inside it', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));

    expect(screen.getByRole('dialog', { name: 'Add to your home screen' })).toBeInTheDocument();
  });

  it('keeps the open panel when the last remaining widget is switched on', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: { ...ALL_WIDGETS_ON, showClock: false } });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    await user.click(screen.getByRole('checkbox', { name: 'Clock' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Clock' })).toBeChecked();
  });

  it('disappears once that panel is closed', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: { ...ALL_WIDGETS_ON, showClock: false } });
    const { container } = render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    await user.click(screen.getByRole('checkbox', { name: 'Clock' }));
    await user.keyboard('{Escape}');

    expect(container).toBeEmptyDOMElement();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('checkbox', { name: 'Clock' })).not.toBeInTheDocument();
  });

  it('closes on an outside click', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('checkbox', { name: 'Clock' })).not.toBeInTheDocument();
  });
});
