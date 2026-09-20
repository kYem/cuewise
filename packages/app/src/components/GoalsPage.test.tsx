import { getYesterdayDateString } from '@cuewise/shared';
import { completedGoalFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalStore } from '../stores/goal-store';
import {
  buildUnfinishedTasks,
  createGoalStoreMock,
  createGoalsPageStore,
  type MockGoalsPageStore,
} from './__fixtures__/goals-list.fixtures';
import { GoalsPage } from './GoalsPage';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));

// The page under test is the Tasks tab chrome; its children each have their own tests.
vi.mock('./PageHeader', () => ({ PageHeader: () => <div data-testid="page-header" /> }));
vi.mock('./AllGoalsList', () => ({ AllGoalsList: () => <div data-testid="all-goals-list" /> }));
vi.mock('./UpcomingTasks', () => ({ UpcomingTasks: () => null }));
vi.mock('./goals', () => ({ GoalsSection: () => null }));

function mountStore(store: MockGoalsPageStore): MockGoalsPageStore {
  vi.mocked(useGoalStore).mockImplementation(createGoalStoreMock(store));
  return store;
}

describe('GoalsPage - Unfinished callout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts unfinished tasks from previous days above the list', () => {
    mountStore(createGoalsPageStore(buildUnfinishedTasks(2)));

    render(<GoalsPage />);

    expect(screen.getByText('2 unfinished from previous days')).toBeInTheDocument();
  });

  it('moves them all to today from the callout', async () => {
    const user = userEvent.setup();
    const unfinished = buildUnfinishedTasks(2);
    const store = mountStore(createGoalsPageStore(unfinished));

    render(<GoalsPage />);
    await user.click(screen.getByRole('button', { name: 'Move all to today' }));

    expect(store.moveTasksToToday).toHaveBeenCalledWith(unfinished.map((task) => task.id));
  });

  it('is absent when every past task is done', () => {
    mountStore(
      createGoalsPageStore([completedGoalFactory.build({ date: getYesterdayDateString() })])
    );

    render(<GoalsPage />);

    expect(screen.queryByRole('button', { name: 'Move all to today' })).not.toBeInTheDocument();
  });

  it('is absent under the completed filter', () => {
    mountStore(createGoalsPageStore(buildUnfinishedTasks(2), 'completed'));

    render(<GoalsPage />);

    expect(screen.queryByRole('button', { name: 'Move all to today' })).not.toBeInTheDocument();
  });
});
