import { defaultSettings } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PomodoroMiniSettings } from './PomodoroMiniSettings';

const settings = {
  ...defaultSettings,
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  pomodoroLongBreakDuration: 15,
  pomodoroLongBreakInterval: 4,
};

describe('PomodoroMiniSettings', () => {
  it('shows the four rhythm values at a glance', () => {
    render(<PomodoroMiniSettings settings={settings} onApply={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Focus duration' })).toHaveTextContent('25m');
    expect(screen.getByRole('button', { name: 'Break length' })).toHaveTextContent('5m');
    expect(screen.getByRole('button', { name: 'Long break length' })).toHaveTextContent('15m');
    // interval has no suffix — renders a bare count, not "4m"
    expect(screen.getByRole('button', { name: 'Long break interval' })).toHaveTextContent('4');
  });

  it('opens the mini-settings popover when a value is tapped', () => {
    render(<PomodoroMiniSettings settings={settings} onApply={vi.fn()} />);
    expect(screen.queryByText('Deep work')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Focus duration' }));
    expect(screen.getByText('Deep work')).toBeInTheDocument();
  });

  it('applies the whole rhythm when a preset is tapped', () => {
    const onApply = vi.fn();
    render(<PomodoroMiniSettings settings={settings} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus duration' }));
    fireEvent.click(screen.getByRole('button', { name: /deep work/i }));
    expect(onApply).toHaveBeenCalledWith({
      pomodoroWorkDuration: 50,
      pomodoroBreakDuration: 10,
      pomodoroLongBreakDuration: 25,
      pomodoroLongBreakInterval: 2,
    });
  });

  it('steps a single field via its stepper', () => {
    const onApply = vi.fn();
    render(<PomodoroMiniSettings settings={settings} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus duration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Focus duration' }));
    // 25 → 30 (coarse 5-min step from 20 up)
    expect(onApply).toHaveBeenCalledWith({ pomodoroWorkDuration: 30 });
  });

  it('steps focus by 1 below 20 minutes', () => {
    const onApply = vi.fn();
    render(
      <PomodoroMiniSettings
        settings={{ ...settings, pomodoroWorkDuration: 15 }}
        onApply={onApply}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Focus duration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Focus duration' }));
    // 15 → 16 (fine 1-min step below 20)
    expect(onApply).toHaveBeenCalledWith({ pomodoroWorkDuration: 16 });
  });

  it('maps the long-break and interval fields to the right key and step', () => {
    const onApply = vi.fn();
    render(<PomodoroMiniSettings settings={settings} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Long break length' }));
    // long break steps by 5: 15 → 20, on pomodoroLongBreakDuration
    fireEvent.click(screen.getByRole('button', { name: 'Increase Long break length' }));
    expect(onApply).toHaveBeenCalledWith({ pomodoroLongBreakDuration: 20 });
    // interval steps by 1: 4 → 5, on pomodoroLongBreakInterval
    fireEvent.click(screen.getByRole('button', { name: 'Increase Long break interval' }));
    expect(onApply).toHaveBeenCalledWith({ pomodoroLongBreakInterval: 5 });
  });

  it('marks only the tapped field as expanded', () => {
    render(<PomodoroMiniSettings settings={settings} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Break length' }));
    expect(screen.getByRole('button', { name: 'Break length' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Focus duration' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('disables a stepper at its bound', () => {
    render(
      <PomodoroMiniSettings
        settings={{ ...settings, pomodoroWorkDuration: 60 }}
        onApply={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Focus duration' }));
    expect(screen.getByRole('button', { name: 'Increase Focus duration' })).toBeDisabled();
  });
});
