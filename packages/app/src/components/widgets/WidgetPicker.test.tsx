import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_WIDGETS_OFF, mockWidgetPickerStores } from '../__fixtures__/widget-picker.fixtures';
import { WidgetPicker } from './WidgetPicker';

vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../stores/weather-store', () => ({ useWeatherStore: vi.fn() }));
vi.mock('../settings/WeatherLocationPicker', () => ({
  WeatherLocationPicker: () => <div data-testid="location-picker" />,
}));

describe('WidgetPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every widget with its destination', () => {
    mockWidgetPickerStores();
    render(<WidgetPicker />);

    expect(screen.getByRole('checkbox', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Quick links' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Weather' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getAllByText('Centre')).toHaveLength(2);
  });

  it('writes only the toggled widget key', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<WidgetPicker />);

    await user.click(screen.getByRole('checkbox', { name: 'Clock' }));

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ showClock: true });
  });

  it('turns a widget back off', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockWidgetPickerStores({ settings: { showNotes: true } });
    render(<WidgetPicker />);

    await user.click(screen.getByRole('checkbox', { name: 'Notes' }));

    expect(updateSettings).toHaveBeenCalledWith({ showNotes: false });
  });

  it('asks for a city when weather is on without one, since the widget would render nothing', () => {
    mockWidgetPickerStores({ settings: { showWeather: true }, hasWeatherLocation: false });
    render(<WidgetPicker />);

    expect(screen.getByText('Pick a city to see your weather.')).toBeInTheDocument();
  });

  it('drops the city prompt once a location is set', () => {
    mockWidgetPickerStores({ settings: { showWeather: true }, hasWeatherLocation: true });
    render(<WidgetPicker />);

    expect(screen.queryByText('Pick a city to see your weather.')).not.toBeInTheDocument();
  });

  it('does not ask for a city while weather is off', () => {
    mockWidgetPickerStores({ settings: { showWeather: false }, hasWeatherLocation: false });
    render(<WidgetPicker />);

    expect(screen.queryByText('Pick a city to see your weather.')).not.toBeInTheDocument();
  });
});
