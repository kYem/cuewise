import type { Settings } from '@cuewise/shared';
import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { goalFactory, notionItemFactory } from '@cuewise/test-utils/factories';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectedWithTable,
  fakeNotionHost,
  itemsOf,
} from '../notion/__fixtures__/notion-host.fixtures';
import { useCalendarStore } from '../stores/calendar-store';
import { useGoalStore } from '../stores/goal-store';
import { useNotionItemsStore } from '../stores/notion-items-store';
import { useNotionStore } from '../stores/notion-store';
import { useSettingsStore } from '../stores/settings-store';
import { renderGoalsWithNotion } from './__fixtures__/goals-notion.fixtures';

vi.mock('../stores/goal-store', () => ({ useGoalStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../utils/google-calendar', () => ({ isCalendarFeatureEnabled: vi.fn(() => false) }));
vi.mock('@cuewise/storage', () => ({
  getStorageUsage: vi.fn(async () => ({ available: true, isWarning: false, isCritical: false })),
}));
vi.mock('./GoalsList', () => ({ GoalsList: () => <p>My goals list</p> }));

const brief = notionItemFactory.build({ text: 'Write the brief' });
const shipped = notionItemFactory.build({ text: 'Ship the release', done: true });

function mockStores(settings: Partial<Settings> = {}) {
  const today = goalFactory.build();
  vi.mocked(useGoalStore).mockImplementation(
    createSelectorMock({
      isLoading: false,
      error: null,
      todayTasks: [today],
      goals: [today],
      initialize: vi.fn(),
    })
  );
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock({ initialize: vi.fn() }));
  const updateSettings = vi.fn();
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ goalViewMode: 'full', ...settings, updateSettings })
  );
  return { updateSettings };
}

function connectedHost(items = [brief, shipped], truncated = false) {
  const host = fakeNotionHost();
  host.api.getNotionConnection.mockResolvedValue(connectedWithTable);
  host.api.listNotionItems.mockResolvedValue(itemsOf(items, truncated));
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotionStore.setState({ view: { status: 'loading' }, busy: false });
  useNotionItemsStore.setState({ list: { status: 'idle' }, saving: new Set() });
});

describe('GoalsSection - Notion source', () => {
  it('offers no switch where the host has no Notion', () => {
    mockStores();

    renderGoalsWithNotion(undefined);

    expect(screen.queryByRole('button', { name: 'Notion' })).toBeNull();
  });

  it('offers no switch while signed out of Cuewise', () => {
    mockStores();
    const host = connectedHost();

    renderGoalsWithNotion(host, { status: 'off' });

    expect(screen.queryByRole('button', { name: 'Notion' })).toBeNull();
    expect(host.api.getNotionConnection).not.toHaveBeenCalled();
  });

  it('offers no switch until a table is connected', async () => {
    mockStores();
    const host = fakeNotionHost();

    renderGoalsWithNotion(host);

    await waitFor(() => expect(useNotionStore.getState().view.status).toBe('disconnected'));
    expect(screen.queryByRole('button', { name: 'Notion' })).toBeNull();
  });

  it('remembers the Notion choice once a table is connected', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores();

    renderGoalsWithNotion(connectedHost());
    await user.click(await screen.findByRole('button', { name: 'Notion' }));

    expect(updateSettings).toHaveBeenCalledWith({ goalsSource: 'notion' });
  });

  it('lists open rows and keeps completed ones behind a toggle', async () => {
    const user = userEvent.setup();
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(connectedHost());

    expect(await screen.findByText('Write the brief')).toBeInTheDocument();
    expect(screen.queryByText('My goals list')).toBeNull();
    expect(screen.queryByText('Ship the release')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show completed (1)' }));
    expect(screen.getByText('Ship the release')).toBeInTheDocument();
  });

  it('writes a tick back to Notion', async () => {
    const user = userEvent.setup();
    mockStores({ goalsSource: 'notion' });
    const host = connectedHost();

    renderGoalsWithNotion(host);
    await user.click(
      await screen.findByRole('button', { name: 'Mark as complete: Write the brief' })
    );

    expect(host.api.setNotionItemDone).toHaveBeenCalledExactlyOnceWith(brief.pageId, true);
  });

  it('says when only the first rows are shown', async () => {
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(connectedHost([brief], true));

    expect(await screen.findByText('Showing the first 500 rows')).toBeInTheDocument();
  });

  it('points at Settings once the chosen table is gone', async () => {
    const user = userEvent.setup();
    const onOpenIntegrations = vi.fn();
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(fakeNotionHost(), { onOpenIntegrations });
    await user.click(await screen.findByRole('button', { name: 'Open Notion settings' }));

    expect(screen.getByText('Connect Notion to see its tasks here.')).toBeInTheDocument();
    expect(onOpenIntegrations).toHaveBeenCalledOnce();
  });
});
