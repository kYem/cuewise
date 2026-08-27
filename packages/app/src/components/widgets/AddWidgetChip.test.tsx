import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_WIDGETS_OFF,
  ALL_WIDGETS_ON,
  mockWidgetPickerStores,
} from '../__fixtures__/widget-picker.fixtures';
import { AddWidgetChip } from './AddWidgetChip';

vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../stores/weather-store', () => ({ useWeatherStore: vi.fn() }));
vi.mock('../settings/WeatherLocationPicker', () => ({
  WeatherLocationPicker: () => <div data-testid="location-picker" />,
}));

describe('AddWidgetChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('opens the picker without presets', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores({ settings: ALL_WIDGETS_OFF });
    render(<AddWidgetChip />);

    await user.click(screen.getByRole('button', { name: 'Add a widget' }));

    expect(screen.getByRole('checkbox', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Minimal' })).not.toBeInTheDocument();
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
