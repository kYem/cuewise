import type { Settings } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectedWithTable, fakeNotionHost } from '../notion/__fixtures__/notion-host.fixtures';
import { LiveIds, renderWithShortcuts } from '../shortcuts/__fixtures__/shortcuts.fixtures';
import { ShortcutProvider } from '../shortcuts/ShortcutProvider';
import { useCalendarStore } from '../stores/calendar-store';
import { useGoalStore } from '../stores/goal-store';
import { useNotionStore } from '../stores/notion-store';
import { useSettingsStore } from '../stores/settings-store';
import { FakeSyncController } from '../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext } from '../sync/sync-controller';
import { createMockGoalStore } from './__fixtures__/goals-list.fixtures';
import { GoalInput } from './GoalInput';
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

function mockStores(
  settings: Partial<Settings>,
  tasks = [goalFactory.build({ completed: false })],
  state: { isLoading?: boolean; error?: string | null } = {}
) {
  const store = {
    ...createMockGoalStore({ todayTasks: tasks, goals: tasks, isLoading: state.isLoading }),
    error: state.error ?? null,
    initialize: vi.fn(),
    addTask: vi.fn(async () => true),
  };
  vi.mocked(useGoalStore).mockImplementation(createSelectorMock(store));
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock({ initialize: vi.fn() }));
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ showCompletedGoals: false, ...settings })
  );
}

describe('GoalsSection - add-goal shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'full',
    'compact',
    'focus',
  ] as const)('n opens and focuses the add input in %s view with tasks on screen', (goalViewMode) => {
    mockStores({ goalViewMode });
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('n opens the add input once every task is done in focus view', () => {
    mockStores({ goalViewMode: 'focus' }, [goalFactory.build({ completed: true })]);
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('cancels the n so the browser cannot type it into the input it opens', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    const allowed = fireEvent.keyDown(document.body, { key: 'n' });

    expect(allowed).toBe(false);
  });

  it('closes the add row n opened once the first goal is added in focus view', async () => {
    mockStores({ goalViewMode: 'focus' }, []);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    fireEvent.keyDown(document.body, { key: 'n' });
    const input = screen.getByRole('textbox', ADD_INPUT);

    fireEvent.change(input, { target: { value: 'Plan the week' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    mockStores({ goalViewMode: 'focus' });
    rerender(
      <ShortcutProvider>
        <GoalsSection />
      </ShortcutProvider>
    );

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('Escape closes the add row n opened from the empty focus view', () => {
    mockStores({ goalViewMode: 'focus' }, []);
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    fireEvent.keyDown(document.body, { key: 'n' });

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });
    mockStores({ goalViewMode: 'focus' });
    rerender(
      <ShortcutProvider>
        <GoalsSection />
      </ShortcutProvider>
    );

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it.each([
    ['tasks on screen', [goalFactory.build({ completed: false })]],
    ['every task done', [goalFactory.build({ completed: true })]],
  ])('Escape closes the add row n opened in focus view with %s', (_label, tasks) => {
    mockStores({ goalViewMode: 'focus' }, tasks);
    renderWithShortcuts(<GoalsSection />);
    fireEvent.keyDown(document.body, { key: 'n' });

    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('closes the compact add row once a goal is added', async () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);
    fireEvent.keyDown(document.body, { key: 'n' });
    const input = screen.getByRole('textbox', ADD_INPUT);

    fireEvent.change(input, { target: { value: 'Plan the week' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('drops the add row n opened when the source goes to Notion and back', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithTable);
    const controller = new FakeSyncController();
    controller.setStatus('active');
    const section = () => (
      <ShortcutProvider>
        <SyncControllerContext.Provider value={controller}>
          <GoalsSection notionHost={host} />
        </SyncControllerContext.Provider>
      </ShortcutProvider>
    );
    mockStores({ goalViewMode: 'compact', goalsSource: 'cuewise' });
    const { rerender } = render(section());
    await waitFor(() => expect(useNotionStore.getState().view.status).toBe('connected'));
    fireEvent.keyDown(document.body, { key: 'n' });

    mockStores({ goalViewMode: 'compact', goalsSource: 'notion' });
    rerender(section());
    mockStores({ goalViewMode: 'compact', goalsSource: 'cuewise' });
    rerender(section());

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('offers no add-goal shortcut while goals are loading', () => {
    mockStores({ goalViewMode: 'compact' }, undefined, { isLoading: true });
    renderWithShortcuts(
      <>
        <GoalsSection />
        <LiveIds />
      </>
    );

    expect(screen.getByTestId('live')).not.toHaveTextContent('goal.add');
  });

  it('offers no add-goal shortcut when goals failed to load', () => {
    mockStores({ goalViewMode: 'compact' }, undefined, { error: 'Could not load goals' });
    renderWithShortcuts(
      <>
        <GoalsSection />
        <LiveIds />
      </>
    );

    expect(screen.getByTestId('live')).not.toHaveTextContent('goal.add');
  });

  it('leaves focus alone when an add input mounts after an earlier n', () => {
    mockStores({ goalViewMode: 'full' });
    render(<GoalInput variant="widget" focusRequest={2} />);

    expect(screen.getByRole('textbox', ADD_INPUT)).not.toHaveFocus();
  });

  it('focuses a mounted add input when n asks again', () => {
    mockStores({ goalViewMode: 'full' });
    const { rerender } = render(<GoalInput variant="widget" focusRequest={2} />);

    rerender(<GoalInput variant="widget" focusRequest={3} />);

    expect(screen.getByRole('textbox', ADD_INPUT)).toHaveFocus();
  });

  it('Escape closes the add row n opened in compact view', () => {
    mockStores({ goalViewMode: 'compact' });
    renderWithShortcuts(<GoalsSection />);

    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(screen.getByRole('textbox', ADD_INPUT), { key: 'Escape' });

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('switching view closes the add row n opened', () => {
    mockStores({ goalViewMode: 'compact' });
    const { rerender } = renderWithShortcuts(<GoalsSection />);
    fireEvent.keyDown(document.body, { key: 'n' });

    mockStores({ goalViewMode: 'full' });
    rerender(
      <ShortcutProvider>
        <GoalsSection />
      </ShortcutProvider>
    );
    mockStores({ goalViewMode: 'compact' });
    rerender(
      <ShortcutProvider>
        <GoalsSection />
      </ShortcutProvider>
    );

    expect(screen.queryByRole('textbox', ADD_INPUT)).not.toBeInTheDocument();
  });

  it('offers the add-goal shortcut for Cuewise goals', () => {
    mockStores({ goalViewMode: 'full' });
    renderWithShortcuts(
      <>
        <GoalsSection />
        <LiveIds />
      </>
    );

    expect(screen.getByTestId('live')).toHaveTextContent('goal.add');
  });
});
