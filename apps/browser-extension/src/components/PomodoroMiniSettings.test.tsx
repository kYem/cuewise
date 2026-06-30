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
});
