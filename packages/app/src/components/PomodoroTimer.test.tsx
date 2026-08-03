import type { Goal } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { completedGoalFactory, goalFactory } from '@cuewise/test-utils/factories';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStorageSync, useSoundsStore } from '../stores/sounds-store';
import { PomodoroTimer } from './PomodoroTimer';

// The timer pulls from five stores plus leader/sync hooks; stub them all so the
// suite can drive the goal-picker behaviour in isolation.
vi.mock('../stores/pomodoro-store', () => ({
  usePomodoroStore: vi.fn(),
  usePomodoroStorageSync: vi.fn(),
}));
vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/sounds-store', () => ({
  useSoundsStore: vi.fn(),
  useSoundsStorageSync: vi.fn(),
}));
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
  activeSource?: 'none' | 'ambient' | 'youtube';
  isSoundsLeader?: boolean;
  /** Passed in when a test re-mocks across a rerender and needs the same spies to survive it. */
  soundsActions?: { pause: Mock; resume: Mock; stop: Mock };
  /** The shared settings fixture disables music, which short-circuits the timer's sounds effect. */
  music?: boolean;
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
  const soundsActions = options.soundsActions ?? { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  const soundsState = {
    activeSource: options.activeSource ?? 'none',
    isPlaying: false,
    isLeader: options.isSoundsLeader ?? false,
    ...soundsActions,
    initialize: vi.fn(),
    getActiveSourceName: vi.fn(() => ''),
  };

  vi.mocked(usePomodoroStore).mockImplementation(createSelectorMock(pomodoroState));
  vi.mocked(useGoalStore).mockImplementation(createSelectorMock(goalState));
  // focusModeEnabled: false keeps the focus button (and its store call) out of the tree.
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({
      focusModeEnabled: false,
      updateSettings,
      pomodoroMusicEnabled: options.music ?? false,
    })
  );
  vi.mocked(useSoundsStore).mockImplementation(createSelectorMock(soundsState));

  return { setSelectedGoal, reloadSettings, updateSettings, soundsState };
}

describe('PomodoroTimer - sounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the sounds storage sync', () => {
    mockStores();

    render(<PomodoroTimer />);

    expect(useSoundsStorageSync).toHaveBeenCalled();
  });

  it('drives the timer-following sounds from the tab holding the audio', () => {
    const { soundsState } = mockStores({
      music: true,
      activeSource: 'youtube',
      isSoundsLeader: true,
      status: 'running',
    });

    render(<PomodoroTimer />);

    expect(soundsState.resume).toHaveBeenCalled();
  });

  it('stops them when the tab holding the audio goes away', () => {
    const { soundsState } = mockStores({
      music: true,
      activeSource: 'youtube',
      isSoundsLeader: true,
      status: 'running',
    });

    const { unmount } = render(<PomodoroTimer />);
    unmount();

    expect(soundsState.stop).toHaveBeenCalled();
  });

  it('takes them over once this tab wins the election', () => {
    // Leadership is won asynchronously, so every tab's first render is a non-leader render — the
    // effect has to re-run on the flip or no tab ever drives sounds.
    const soundsActions = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
    const playing = {
      music: true,
      activeSource: 'youtube',
      isSoundsLeader: false,
      status: 'running',
      soundsActions,
    } as const;
    mockStores(playing);
    const { rerender } = render(<PomodoroTimer />);
    expect(soundsActions.resume).not.toHaveBeenCalled();

    mockStores({ ...playing, isSoundsLeader: true });
    rerender(<PomodoroTimer />);

    expect(soundsActions.resume).toHaveBeenCalled();
  });

  it('pauses them when the timer pauses', () => {
    const { soundsState } = mockStores({
      music: true,
      activeSource: 'youtube',
      isSoundsLeader: true,
      status: 'paused',
    });

    render(<PomodoroTimer />);

    expect(soundsState.pause).toHaveBeenCalled();
  });

  it('leaves them alone in a second tab, which would stop audio it never started', () => {
    const { soundsState } = mockStores({
      music: true,
      activeSource: 'youtube',
      isSoundsLeader: false,
      status: 'running',
    });

    const { unmount } = render(<PomodoroTimer />);
    unmount();

    expect(soundsState.resume).not.toHaveBeenCalled();
    expect(soundsState.stop).not.toHaveBeenCalled();
  });
});

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

describe('PomodoroTimer - goal hint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the hint when a work session has active goals and none is selected', () => {
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo] });

    render(<PomodoroTimer />);

    expect(screen.getByText('Select a goal')).toBeInTheDocument();
  });

  it('is part of the header toggle rather than a second trigger', () => {
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo] });

    render(<PomodoroTimer />);

    expect(screen.getByTitle('Select a goal')).toContainElement(screen.getByText('Select a goal'));
    expect(screen.queryByRole('button', { name: 'Select a goal' })).not.toBeInTheDocument();
  });

  it('opens the dropdown when the hint is clicked', async () => {
    const user = userEvent.setup();
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo] });

    render(<PomodoroTimer />);

    await user.click(screen.getByText('Select a goal'));

    expect(screen.getByTitle('Select a goal')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the hint when the selected goal is no longer one of today tasks', () => {
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo], selectedGoalId: 'goal-from-yesterday' });

    render(<PomodoroTimer />);

    expect(screen.getByText('Select a goal')).toBeInTheDocument();
    expect(screen.getByTitle('Select a goal')).toHaveTextContent('Focus Session');
  });

  it('hides the hint once a goal is selected', () => {
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ todayTasks: [todo], selectedGoalId: todo.id });

    render(<PomodoroTimer />);

    expect(screen.queryByText('Select a goal')).not.toBeInTheDocument();
  });

  it('hides the hint when today has no incomplete goals', () => {
    const done = completedGoalFactory.build({ text: 'Already finished' });
    mockStores({ todayTasks: [done] });

    render(<PomodoroTimer />);

    expect(screen.queryByText('Select a goal')).not.toBeInTheDocument();
  });

  it('hides the hint during a break', () => {
    const todo = goalFactory.build({ text: 'Write the report', completed: false });
    mockStores({ sessionType: 'break', todayTasks: [todo] });

    render(<PomodoroTimer />);

    expect(screen.queryByText('Select a goal')).not.toBeInTheDocument();
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
    // reloadSettings must run after updateSettings — else the timer resyncs stale settings
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      reloadSettings.mock.invocationCallOrder[0]
    );
  });
});

describe('PomodoroTimer - chrome variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses white-on-dark chrome by default, for the glass photo behind it', () => {
    mockStores();

    render(<PomodoroTimer />);

    expect(screen.getByTestId('pomodoro-timer-card')).toHaveClass('bg-black/25');
    expect(screen.getByText('25:00')).toHaveClass('text-white');
    expect(screen.getByTestId('pomodoro-rhythm-row')).toHaveClass('text-white/60');
    expect(screen.getByTitle('Focus duration')).toHaveClass('hover:text-white/90');
  });

  it('uses theme tokens on the surface variant, so a light page stays readable', () => {
    mockStores();

    render(<PomodoroTimer variant="surface" />);

    const card = screen.getByTestId('pomodoro-timer-card');
    expect(card).toHaveClass('bg-surface/80');
    expect(card).not.toHaveClass('bg-black/25');
    expect(screen.getByText('25:00')).toHaveClass('text-primary');
    expect(screen.getByText('25:00')).not.toHaveClass('text-white');
  });

  // The rhythm row lives in PomodoroMiniSettings, a grandchild the timer forwards to.
  it('passes the variant down to the rhythm row', () => {
    mockStores();

    render(<PomodoroTimer variant="surface" />);

    const row = screen.getByTestId('pomodoro-rhythm-row');
    expect(row).toHaveClass('text-secondary');
    expect(row).not.toHaveClass('text-white/60');
    expect(screen.getByTitle('Focus duration')).toHaveClass('hover:text-text-primary');
    expect(screen.getByTitle('Focus duration')).not.toHaveClass('hover:text-white/90');
  });
});
