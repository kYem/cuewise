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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['full', 'tasks on screen', [goalFactory.build({ completed: false })]],
    ['compact', 'tasks on screen', [goalFactory.build({ completed: false })]],
    ['focus', 'tasks on screen', [goalFactory.build({ completed: false })]],
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
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
    renderWithShortcuts(<GoalsSection />);

    press('n');

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
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
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
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
    ['the last goal is completed', [goalFactory.build({ completed: false })], [DONE_GOAL]],
    ['an open goal syncs in at All done', [DONE_GOAL], [DONE_GOAL, OPEN_GOAL]],
  ])('closes the focus-view add row n opened when %s', (_change, before, after) => {
    mockStores({ goalViewMode: 'focus' }, before);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    press('n');
    expect(screen.getByRole('textbox', ADD_INPUT)).toBeInTheDocument();

    mockStores({ goalViewMode: 'focus' }, after);
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
    ['tasks on screen', [goalFactory.build({ completed: false })]],
    ['every task done', [goalFactory.build({ completed: true })]],
  ])('Escape closes the add row n opened in focus view with %s', (_label, tasks) => {
    mockStores({ goalViewMode: 'focus' }, tasks);
    renderWithShortcuts(<GoalsSection />);
    press('n');

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the add row n opened once a goal is added with every task done', async () => {
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
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
