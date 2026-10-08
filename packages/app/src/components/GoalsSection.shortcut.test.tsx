import { goalFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectedWithTable, fakeNotionHost } from '../notion/__fixtures__/notion-host.fixtures';
import {
  liveIds,
  onPlatform,
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

function pressN() {
  return press('n');
}

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

    pressN();

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('Add a goal from the palette leaves the cursor in the add input', () => {
    onPlatform('Win32');
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    press('k', { ctrlKey: true });
    const search = screen.getByRole('combobox', { name: 'Search commands' });
    fireEvent.change(search, { target: { value: 'add a goal' } });
    press('Enter', {}, search);

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('n opens the add input once every task is done in focus view', () => {
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
    renderWithShortcuts(<GoalsSection />);

    pressN();

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('cancels the n so the browser cannot type it into the input it opens', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    expect(pressN()).toBe(false);
  });

  it('closes the add row n opened once the first goal is added in focus view', async () => {
    mockStores({ goalViewMode: 'focus' }, []);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    pressN();

    await submitGoal('Plan the week');
    mockStores({ goalViewMode: 'focus' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('Escape closes the add row n opened from the empty focus view', () => {
    mockStores({ goalViewMode: 'focus' }, []);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    pressN();

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });
    mockStores({ goalViewMode: 'focus' });
    rerender(<GoalsSection />);

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it.each([
    ['tasks on screen', [goalFactory.build({ completed: false })]],
    ['every task done', [goalFactory.build({ completed: true })]],
  ])('Escape closes the add row n opened in focus view with %s', (_label, tasks) => {
    mockStores({ goalViewMode: 'focus' }, tasks);
    renderWithShortcuts(<GoalsSection />);
    pressN();

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the add row n opened once a goal is added with every task done', async () => {
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
    renderWithShortcuts(<GoalsSection />);
    pressN();

    await submitGoal('One more');

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the compact add row once a goal is added', async () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);
    pressN();

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
    pressN();
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

    pressN();
    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('switching view closes the add row n opened', () => {
    mockStores({ goalViewMode: 'compact' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    pressN();
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
