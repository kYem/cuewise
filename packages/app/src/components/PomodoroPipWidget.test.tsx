import { createSelectorMock } from '@cuewise/test-utils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { usePomodoroLeader } from '../hooks/usePomodoroLeader';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
import type { SessionType } from '../utils/pomodoro-styles';
import { PomodoroPipWidget } from './PomodoroPipWidget';

// The widget reads the pomodoro store and runs the leader/sync hooks; stub them
// so the suite can drive the display in isolation.
vi.mock('../stores/pomodoro-store', () => ({
  usePomodoroStore: vi.fn(),
  usePomodoroStorageSync: vi.fn(),
}));
vi.mock('../hooks/usePomodoroLeader', () => ({ usePomodoroLeader: vi.fn() }));

interface MockOptions {
  status?: 'idle' | 'running' | 'paused';
  sessionType?: SessionType;
  timeRemaining?: number;
  pause?: Mock;
  resume?: Mock;
}

function mockStore(options: MockOptions = {}) {
  const pause = options.pause ?? vi.fn();
  const resume = options.resume ?? vi.fn();
  const state = {
    status: options.status ?? 'running',
    sessionType: options.sessionType ?? 'work',
    timeRemaining: options.timeRemaining ?? 1500,
    pause,
    resume,
  };
  (usePomodoroStore as unknown as Mock).mockImplementation(createSelectorMock(state));
  return { pause, resume };
}

describe('PomodoroPipWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the formatted time', () => {
    mockStore({ status: 'running', sessionType: 'work', timeRemaining: 1500 });
    render(<PomodoroPipWidget />);
    expect(screen.getByText('25:00')).toBeInTheDocument();
  });

  it.each([
    ['work', 'Work'],
    ['break', 'Break'],
    ['longBreak', 'Long Break'],
  ] as const)('renders the %s session label as "%s"', (sessionType, label) => {
    mockStore({ status: 'running', sessionType });
    render(<PomodoroPipWidget />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('runs the storage-sync and leader hooks so the float keeps ticking standalone', () => {
    mockStore({ status: 'running' });
    render(<PomodoroPipWidget />);
    expect(usePomodoroStorageSync).toHaveBeenCalled();
    expect(usePomodoroLeader).toHaveBeenCalled();
  });

  it('pauses a running session on click', async () => {
    const { pause } = mockStore({ status: 'running' });
    render(<PomodoroPipWidget />);
    await userEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('resumes a paused session on click', async () => {
    const { resume } = mockStore({ status: 'paused' });
    render(<PomodoroPipWidget />);
    await userEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with no control when idle', () => {
    mockStore({ status: 'idle' });
    render(<PomodoroPipWidget />);
    expect(screen.getByText('No active session')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
