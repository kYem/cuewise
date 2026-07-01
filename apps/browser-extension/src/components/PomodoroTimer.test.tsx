import type { Goal } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory } from '@cuewise/test-utils/factories';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStore } from '../stores/sounds-store';
import { PomodoroTimer } from './PomodoroTimer';

// The timer pulls from five stores plus leader/sync hooks; stub them all so the
// suite can drive the goal-picker behaviour in isolation.
vi.mock('../stores/pomodoro-store', () => ({
  usePomodoroStore: vi.fn(),
  usePomodoroStorageSync: vi.fn(),
}));
vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));
vi.mock('../stores/focus-mode-store', () => ({
  useFocusModeStore: Object.assign(vi.fn(), { getState: () => ({ enterFocusMode: vi.fn() }) }),
}));
vi.mock('../hooks/usePomodoroLeader', () => ({ usePomodoroLeader: vi.fn() }));
vi.mock('../hooks/useSoundsLeader', () => ({ useSoundsLeader: vi.fn() }));

interface MockOptions {
  sessionType?: 'work' | 'break' | 'longBreak';
  status?: 'idle' | 'running' | 'paused';
  selectedGoalId?: string | null;
  todayTasks?: Goal[];
  setSelectedGoal?: Mock;
}

function mockStores(options: MockOptions = {}) {
  const setSelectedGoal = options.setSelectedGoal ?? vi.fn();
  const reloadSettings = vi.fn();
  const updateSettings = vi.fn();
  const pomodoroState = {
    status: options.status ?? 'idle',
    sessionType: options.sessionType ?? 'work',
    timeRemaining: 1500,
    totalTime: 1500,
    workDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    consecutiveWorkSessions: 0,
    longBreakInterval: 4,
    selectedGoalId: options.selectedGoalId ?? null,
    initialize: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    skip: vi.fn(),
    setSelectedGoal,
    reloadSettings,
  };
  const goalState = { todayTasks: options.todayTasks ?? [], initialize: vi.fn() };
  const soundsState = {
    activeSource: 'none',
    isPlaying: false,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    initialize: vi.fn(),
    getActiveSourceName: vi.fn(() => ''),
  };

  vi.mocked(usePomodoroStore).mockImplementation(createSelectorMock(pomodoroState));
  vi.mocked(useGoalStore).mockImplementation(createSelectorMock(goalState));
  // focusModeEnabled: false keeps the focus button (and its store call) out of the tree.
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ focusModeEnabled: false, updateSettings })
  );
  vi.mocked(useSoundsStore).mockImplementation(createSelectorMock(soundsState));

  return { setSelectedGoal, reloadSettings, updateSettings };
}

describe('PomodoroTimer - goal picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the dropdown from the header and lists only incomplete goals', async () => {
    const user = userEvent.setup();
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    const done = goalFactory.build({ text: 'Already finished', completed: true });
    mockStores({ todayTasks: [todo, done] });

    render(<PomodoroTimer />);

    const toggle = screen.getByTitle('Select a goal');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Work on a goal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write the report' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Already finished' })).not.toBeInTheDocument();
  });

  it('selecting a goal calls setSelectedGoal and closes the dropdown', async () => {
    const user = userEvent.setup();
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    const { setSelectedGoal } = mockStores({ todayTasks: [todo] });

    render(<PomodoroTimer />);

    await user.click(screen.getByTitle('Select a goal'));
    await user.click(screen.getByRole('button', { name: 'Write the report' }));

    expect(setSelectedGoal).toHaveBeenCalledWith(todo.id);
    expect(screen.queryByText('Work on a goal')).not.toBeInTheDocument();
  });

  it('shows the chosen goal in the header and clears it from the dropdown', async () => {
    const user = userEvent.setup();
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    const { setSelectedGoal } = mockStores({ todayTasks: [todo], selectedGoalId: todo.id });

    render(<PomodoroTimer />);

    const toggle = screen.getByTitle('Change goal');
    expect(toggle).toHaveTextContent('Write the report');

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Clear goal' }));

    expect(setSelectedGoal).toHaveBeenCalledWith(null);
  });

  it('does not show a Clear goal option when no goal is selected', async () => {
    const user = userEvent.setup();
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo] });

    render(<PomodoroTimer />);

    await user.click(screen.getByTitle('Select a goal'));

    expect(screen.queryByRole('button', { name: 'Clear goal' })).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside it', async () => {
    const user = userEvent.setup();
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo] });

    render(
      <div>
        <PomodoroTimer />
        <button type="button">Outside</button>
      </div>
    );

    await user.click(screen.getByTitle('Select a goal'));
    expect(screen.getByText('Work on a goal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));

    await waitFor(() => {
      expect(screen.queryByText('Work on a goal')).not.toBeInTheDocument();
    });
  });

  it('hides the goal picker during a break and shows the session label', () => {
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ sessionType: 'break', todayTasks: [todo] });

    render(<PomodoroTimer />);

    expect(screen.getByText('Short Break')).toBeInTheDocument();
    expect(screen.queryByTitle('Select a goal')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Change goal')).not.toBeInTheDocument();
  });
});

describe('PomodoroTimer - mini-settings wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applying a preset persists the full patch, then resyncs the timer', async () => {
    const user = userEvent.setup();
    const { updateSettings, reloadSettings } = mockStores();

    render(<PomodoroTimer />);

    // Open the mini-settings popover from a timer value, then tap a rhythm preset.
    await user.click(screen.getByRole('button', { name: 'Focus duration' }));
    await user.click(screen.getByRole('button', { name: /deep work/i }));

    // handleApplyTimerSettings must persist the exact patch, then reloadSettings.
    expect(updateSettings).toHaveBeenCalledWith({
      pomodoroWorkDuration: 50,
      pomodoroBreakDuration: 10,
      pomodoroLongBreakDuration: 25,
      pomodoroLongBreakInterval: 2,
    });
    await waitFor(() => {
      expect(reloadSettings).toHaveBeenCalled();
    });
  });
});
