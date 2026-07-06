import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { ActivePomodoroWidget } from './ActivePomodoroWidget';
import { usePomodoroPip } from './PomodoroPipProvider';

// The widget reads the pomodoro store and runs leader/sync hooks; stub them so
// the suite can drive the pop-out button in isolation.
vi.mock('../stores/pomodoro-store', () => ({
  usePomodoroStore: vi.fn(),
  usePomodoroStorageSync: vi.fn(),
}));
vi.mock('../hooks/usePomodoroLeader', () => ({ usePomodoroLeader: vi.fn() }));
vi.mock('./PomodoroPipProvider', () => ({ usePomodoroPip: vi.fn() }));

function mockPip(options: { isSupported?: boolean; open?: Mock } = {}) {
  const open = options.open ?? vi.fn();
  (usePomodoroPip as unknown as Mock).mockReturnValue({
    isSupported: options.isSupported ?? true,
    open,
  });
  return { open };
}

function mockPomodoro(status: 'idle' | 'running' | 'paused' = 'running') {
  (usePomodoroStore as unknown as Mock).mockReturnValue({
    status,
    sessionType: 'work',
    timeRemaining: 1500,
    pause: vi.fn(),
    resume: vi.fn(),
  });
}

describe('ActivePomodoroWidget pop-out button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('pops out via open() without navigating the opener tab', async () => {
    mockPomodoro('running');
    const { open } = mockPip({ isSupported: true });
    render(<ActivePomodoroWidget />);

    await userEvent.click(screen.getByRole('button', { name: /pop out/i }));

    expect(open).toHaveBeenCalledTimes(1);
    // stopPropagation must keep the click from bubbling to the pill's navigate handler.
    expect(window.location.hash).toBe('');
  });

  it('does not navigate when the pop-out button is activated via keyboard', () => {
    mockPomodoro('running');
    mockPip({ isSupported: true });
    render(<ActivePomodoroWidget />);

    // The pill's role="button" container navigates on Enter/Space; the button's
    // onKeyDown stopPropagation must keep that from firing.
    fireEvent.keyDown(screen.getByRole('button', { name: /pop out/i }), { key: 'Enter' });

    expect(window.location.hash).toBe('');
  });

  it('hides the pop-out button when Document PiP is unsupported', () => {
    mockPomodoro('running');
    mockPip({ isSupported: false });
    render(<ActivePomodoroWidget />);
    expect(screen.queryByRole('button', { name: /pop out/i })).not.toBeInTheDocument();
  });
});
