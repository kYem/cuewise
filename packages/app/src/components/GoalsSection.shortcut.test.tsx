import { goalFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectedWithTable, fakeNotionHost } from '../notion/__fixtures__/notion-host.fixtures';
import {
  liveIds,
  onPlatform,
  paletteSearch,
  press,
  renderWithLiveIds,
  renderWithShortcuts,
} from '../shortcuts/__fixtures__/shortcuts.fixtures';
import { useNotionStore } from '../stores/notion-store';
import { mockGoalsSectionStores as mockStores } from './__fixtures__/goals-list.fixtures';
import { goalsWithNotion } from './__fixtures__/goals-notion.fixtures';
import { CHECKBOX_TICK_MS } from './AnimatedCheckbox';
import { GoalsSection } from './GoalsSection';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn(() => false) }));
vi.mock('@cuewise/storage', () => ({
  getStorageUsage: vi.fn(async () => ({ available: true, isWarning: false, isCritical: false })),
}));

// The focus view's input keeps its visible label; the others are named "Add a goal".
const ADD_INPUT = { name: /Add a goal|main goal for today/ };
const OPEN_GOAL = goalFactory.build({ completed: false });
const DONE_GOAL = goalFactory.build({ completed: true });
const ANOTHER_GOAL = goalFactory.build({ completed: false });

async function submitGoal(text: string) {
  const input = screen.getByRole('textbox', ADD_INPUT);
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
}

describe('GoalsSection - add-goal shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotionStore.setState({ view: { status: 'loading' }, busy: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ['full', 'tasks on screen', [OPEN_GOAL]],
    ['compact', 'tasks on screen', [OPEN_GOAL]],
    ['focus', 'tasks on screen', [OPEN_GOAL]],
    ['full', 'no tasks', []],
    ['compact', 'no tasks', []],
    ['focus', 'no tasks', []],
  ] as const)('n opens and focuses the add input in %s view with %s', (goalViewMode, _l, tasks) => {
    mockStores({ goalViewMode }, [...tasks]);
    renderWithShortcuts(<GoalsSection />);

    press('n');

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('Add a goal from the palette leaves the cursor in the add input', () => {
    onPlatform('Win32');
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    press('k', { ctrlKey: true });
    fireEvent.change(paletteSearch(), { target: { value: 'add a goal' } });
    press('Enter', {}, paletteSearch());

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('n opens the add input once every task is done in focus view', () => {
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    renderWithShortcuts(<GoalsSection />);

    press('n');

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Add another' })).not.toBeInTheDocument();
  });

  it('keeps the Add another row and its text when an open goal syncs in', () => {
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    const input = screen.getByRole('textbox', ADD_INPUT);
    fireEvent.change(input, { target: { value: 'Half typed' } });

    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL, OPEN_GOAL]);
    rerender(<GoalsSection />);

    expect(screen.getByRole('textbox', ADD_INPUT)).toBe(input);
    expect(input).toHaveValue('Half typed');
  });

  it('keeps the add row and its text through the completion tick of the last goal', async () => {
    vi.useFakeTimers();
    mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    const input = screen.getByRole('textbox', ADD_INPUT);
    fireEvent.change(input, { target: { value: 'Half typed' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(OPEN_GOAL.text) }));
    });
    mockStores({ goalViewMode: 'focus' }, [{ ...OPEN_GOAL, completed: true }]);
    rerender(<GoalsSection />);
    expect(screen.queryByText('All done!')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', ADD_INPUT)).toBe(input);
    act(() => {
      vi.advanceTimersByTime(CHECKBOX_TICK_MS + 1);
    });

    expect(screen.getByText('All done!')).toBeInTheDocument();
    expect(screen.getByRole('textbox', ADD_INPUT)).toBe(input);
    expect(input).toHaveValue('Half typed');
  });

  it('keeps the focus-view add row, its text and focus when the list empties under it', () => {
    mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    const input = screen.getByRole('textbox', ADD_INPUT);
    fireEvent.change(input, { target: { value: 'Half typed' } });

    mockStores({ goalViewMode: 'focus' }, []);
    rerender(<GoalsSection />);

    expect(screen.getByRole('textbox', ADD_INPUT)).toBe(input);
    expect(input).toHaveValue('Half typed');
    expect(input).toHaveFocus();
    expect(screen.queryByText('All done!')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another' })).not.toBeInTheDocument();
  });

  it('shows All done at once when a sync deletes the ticking goal and the rest are done', async () => {
    vi.useFakeTimers();
    mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL, DONE_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(OPEN_GOAL.text) }));
    });
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    rerender(<GoalsSection />);

    expect(screen.queryByText(OPEN_GOAL.text)).not.toBeInTheDocument();
    expect(screen.getByText('All done!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument();
  });

  it('lets the next goal be ticked straight away when a sync deletes the ticking one', async () => {
    vi.useFakeTimers();
    mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(OPEN_GOAL.text) }));
    });

    const store = mockStores({ goalViewMode: 'focus' }, [ANOTHER_GOAL]);
    rerender(<GoalsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(ANOTHER_GOAL.text) }));
    });

    expect(store.toggleTask).toHaveBeenCalledWith(ANOTHER_GOAL.id);
  });

  it("keeps the deleted goal's old tick from cutting the next goal's tick short", async () => {
    vi.useFakeTimers();
    const updateSettings = vi.fn();
    mockStores({ goalViewMode: 'focus', updateSettings }, [OPEN_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(OPEN_GOAL.text) }));
    });
    act(() => {
      vi.advanceTimersByTime(CHECKBOX_TICK_MS / 2);
    });

    mockStores({ goalViewMode: 'focus', updateSettings }, [ANOTHER_GOAL]);
    rerender(<GoalsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(ANOTHER_GOAL.text) }));
    });
    mockStores({ goalViewMode: 'focus', updateSettings }, [{ ...ANOTHER_GOAL, completed: true }]);
    rerender(<GoalsSection />);
    act(() => {
      vi.advanceTimersByTime(CHECKBOX_TICK_MS / 2 + 50);
    });

    expect(screen.getByText(ANOTHER_GOAL.text)).toBeInTheDocument();
    expect(screen.queryByText('All done!')).not.toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('holds the latch while the deleted goal is still saving, then lets the next goal tick', async () => {
    vi.useFakeTimers();
    let finishSaving: (ok: boolean) => void = () => undefined;
    const saving = new Promise<boolean>((resolve) => {
      finishSaving = resolve;
    });
    const first = mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL]);
    first.toggleTask.mockImplementation(() => saving);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(OPEN_GOAL.text) }));
    });

    const next = mockStores({ goalViewMode: 'focus' }, [ANOTHER_GOAL]);
    rerender(<GoalsSection />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ANOTHER_GOAL.text) }));
    expect(next.toggleTask).not.toHaveBeenCalled();

    await act(async () => {
      finishSaving(true);
    });
    act(() => {
      vi.advanceTimersByTime(CHECKBOX_TICK_MS + 1);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(ANOTHER_GOAL.text) }));
    });

    expect(next.toggleTask).toHaveBeenCalledWith(ANOTHER_GOAL.id);
  });

  it('drops a ticking goal once a sync deletes it, whether the list empties or refills', async () => {
    vi.useFakeTimers();
    mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(OPEN_GOAL.text) }));
    });
    mockStores({ goalViewMode: 'focus' }, [{ ...OPEN_GOAL, completed: true }]);
    rerender(<GoalsSection />);
    expect(screen.getByText(OPEN_GOAL.text)).toBeInTheDocument();

    mockStores({ goalViewMode: 'focus' }, []);
    rerender(<GoalsSection />);
    expect(screen.queryByText(OPEN_GOAL.text)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', ADD_INPUT)).toBeInTheDocument();

    mockStores({ goalViewMode: 'focus' }, [ANOTHER_GOAL]);
    rerender(<GoalsSection />);
    expect(screen.queryByText(OPEN_GOAL.text)).not.toBeInTheDocument();
    expect(screen.getByText(ANOTHER_GOAL.text)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(CHECKBOX_TICK_MS + 1);
    });
    expect(screen.queryByText(OPEN_GOAL.text)).not.toBeInTheDocument();
    expect(screen.getByText(ANOTHER_GOAL.text)).toBeInTheDocument();
  });

  it('leaves no stray Add another row when focus view empties and refills', () => {
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));

    mockStores({ goalViewMode: 'focus' }, []);
    rerender(<GoalsSection />);
    mockStores({ goalViewMode: 'focus' }, [OPEN_GOAL]);
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the Add another row once a goal is added from it', async () => {
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    renderWithShortcuts(<GoalsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));

    await submitGoal('One more');

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument();
  });

  it('leaves no stray add row when a goal syncs in after n in the empty focus view', () => {
    mockStores({ goalViewMode: 'focus' }, []);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');

    mockStores({ goalViewMode: 'focus' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('Escape closes the row Add another opened once every task is done', () => {
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    renderWithShortcuts(<GoalsSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument();
  });

  it('cancels the n so the browser cannot type it into the input it opens', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    expect(press('n')).toBe(false);
  });

  it('leaves no stray add row when focus view empties and refills after n', () => {
    mockStores({ goalViewMode: 'focus' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');

    mockStores({ goalViewMode: 'focus' }, []);
    rerender(<GoalsSection />);
    mockStores({ goalViewMode: 'focus' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it.each([
    ['the last goal is completed', [OPEN_GOAL], [DONE_GOAL]],
    ['an open goal syncs in at All done', [DONE_GOAL], [DONE_GOAL, OPEN_GOAL]],
  ])('keeps the focus-view add row and its text when %s', (_change, before, after) => {
    mockStores({ goalViewMode: 'focus' }, before);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    const input = screen.getByRole('textbox', ADD_INPUT);
    fireEvent.change(input, { target: { value: 'Half typed' } });

    mockStores({ goalViewMode: 'focus' }, after);
    rerender(<GoalsSection />);

    expect(screen.getByRole('textbox', ADD_INPUT)).toBe(input);
    expect(input).toHaveValue('Half typed');
  });

  it('leaves no add row after an error screen comes and goes', () => {
    mockStores({ goalViewMode: 'compact' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    expect(screen.getByRole('textbox', ADD_INPUT)).toBeInTheDocument();

    mockStores({ goalViewMode: 'compact' }, undefined, { error: 'Could not save' });
    rerender(<GoalsSection />);
    mockStores({ goalViewMode: 'compact' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('n opens the compact add row with every goal done and "show completed" on', () => {
    mockStores({ goalViewMode: 'compact', showCompletedGoals: true }, [DONE_GOAL]);
    renderWithShortcuts(<GoalsSection />);

    press('n');

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('leaves no stray add row when an open goal syncs into a compact list of finished goals', () => {
    mockStores({ goalViewMode: 'compact' }, [DONE_GOAL]);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();

    mockStores({ goalViewMode: 'compact' }, [DONE_GOAL, OPEN_GOAL]);
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('leaves no stray add row when the compact list empties and refills after n', () => {
    mockStores({ goalViewMode: 'compact' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');

    mockStores({ goalViewMode: 'compact' }, []);
    rerender(<GoalsSection />);
    mockStores({ goalViewMode: 'compact' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('leaves no stray add row when a goal syncs into an empty compact list after n', () => {
    mockStores({ goalViewMode: 'compact' }, []);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');

    mockStores({ goalViewMode: 'compact' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it.each([
    ['tasks on screen', [OPEN_GOAL]],
    ['every task done', [DONE_GOAL]],
  ])('Escape closes the add row n opened in focus view with %s', (_label, tasks) => {
    mockStores({ goalViewMode: 'focus' }, tasks);
    renderWithShortcuts(<GoalsSection />);
    press('n');

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the add row n opened once a goal is added with every task done', async () => {
    mockStores({ goalViewMode: 'focus' }, [DONE_GOAL]);
    renderWithShortcuts(<GoalsSection />);
    press('n');

    await submitGoal('One more');

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the compact add row once a goal is added', async () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);
    press('n');

    await submitGoal('Plan the week');

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('drops the add row n opened when the source goes to Notion and back', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithTable);
    const section = goalsWithNotion(host, { shortcuts: true });
    mockStores({ goalViewMode: 'compact', goalsSource: 'cuewise' });
    const { rerender } = render(section());
    await waitFor(() => expect(useNotionStore.getState().view.status).toBe('connected'));
    press('n');
    expect(screen.getByRole('textbox', ADD_INPUT)).toBeInTheDocument();

    mockStores({ goalViewMode: 'compact', goalsSource: 'notion' });
    rerender(section());
    mockStores({ goalViewMode: 'compact', goalsSource: 'cuewise' });
    rerender(section());

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('Escape closes the add row n opened in compact view', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    press('n');
    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('switching view closes the add row n opened', () => {
    mockStores({ goalViewMode: 'compact' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    expect(screen.getByRole('textbox', ADD_INPUT)).toBeInTheDocument();

    mockStores({ goalViewMode: 'full' });
    rerender(<GoalsSection />);
    mockStores({ goalViewMode: 'compact' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it.each([
    ['goals are loading', { isLoading: true }],
    ['goals failed to load', { error: 'Could not load goals' }],
  ])('offers no add-goal shortcut while %s', (_state, state) => {
    mockStores({ goalViewMode: 'compact' }, undefined, state);
    renderWithLiveIds(<GoalsSection />);

    expect(liveIds()).not.toHaveTextContent('goal.add');
  });

  it('offers the add-goal shortcut for Cuewise goals', () => {
    mockStores({ goalViewMode: 'full' });
    renderWithLiveIds(<GoalsSection />);

    expect(liveIds()).toHaveTextContent('goal.add');
  });
});
