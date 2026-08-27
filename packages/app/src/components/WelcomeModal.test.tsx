import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockWidgetPickerStores } from './__fixtures__/widget-picker.fixtures';
import { WelcomeModal } from './WelcomeModal';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/weather-store', () => ({ useWeatherStore: vi.fn() }));
vi.mock('./settings/WeatherLocationPicker', () => ({
  WeatherLocationPicker: () => <div data-testid="location-picker" />,
}));

describe('WelcomeModal', () => {
  it('should render when isOpen is true', () => {
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Welcome to Cuewise!')).toBeInTheDocument();
    expect(screen.getByText('Your personal productivity companion')).toBeInTheDocument();
  });

  it('declares itself a modal dialog, which is what silences page shortcuts behind it', () => {
    // isShortcutKeyEvent looks for [role="dialog"][aria-modal="true"], so without these the C
    // shortcut swaps the quote slot on the page a first-run user cannot see.
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('should not render when isOpen is false', () => {
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByText('Welcome to Cuewise!')).not.toBeInTheDocument();
  });

  it('should display quick start tips', () => {
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Quick Start')).toBeInTheDocument();
    expect(screen.getByText('Add a goal')).toBeInTheDocument();
    expect(screen.getByText('Browse quotes')).toBeInTheDocument();
    expect(screen.getByText('Start a Pomodoro')).toBeInTheDocument();
  });

  it('should call onClose when "Skip" button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockWidgetPickerStores();

    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    const skipButton = screen.getByRole('button', { name: 'Skip' });
    await user.click(skipButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockWidgetPickerStores();

    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    const backdrop = screen.getByLabelText('Close welcome modal');
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Escape key is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockWidgetPickerStores();

    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens on the tips step', () => {
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Add a goal')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Clock' })).not.toBeInTheDocument();
  });

  it('shows the widget picker with presets on the second step', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('checkbox', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recommended' })).toBeInTheDocument();
  });

  it('closes from the second step', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the first step, so skipping is never punished with a second ask', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockWidgetPickerStores();
    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reopens on the tips step after being closed', async () => {
    const user = userEvent.setup();
    mockWidgetPickerStores();
    const { rerender } = render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    rerender(<WelcomeModal isOpen={false} onClose={vi.fn()} />);
    rerender(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Add a goal')).toBeInTheDocument();
  });
});
