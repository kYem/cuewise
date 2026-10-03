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
  problem,
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
vi.mock('./GoalFocusView', () => ({ GoalFocusView: () => <p>My focused goal</p> }));

const PICKER = /^Tasks from /;
const brief = notionItemFactory.build({ text: 'Write the brief' });
const shipped = notionItemFactory.build({ text: 'Ship the release', done: true });
const draft = notionItemFactory.build({ text: 'Review the draft' });

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
  it('offers no source picker where the host has no Notion', () => {
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(undefined);

    expect(screen.queryByRole('button', { name: PICKER })).toBeNull();
    expect(screen.getByText('My goals list')).toBeInTheDocument();
  });

  it('falls back to own goals while signed out, even with Notion chosen', () => {
    mockStores({ goalsSource: 'notion' });
    const host = connectedHost();

    renderGoalsWithNotion(host, { status: 'off' });

    expect(screen.queryByRole('button', { name: PICKER })).toBeNull();
    expect(screen.getByText('My goals list')).toBeInTheDocument();
    expect(host.api.getNotionConnection).not.toHaveBeenCalled();
    expect(host.api.listNotionItems).not.toHaveBeenCalled();
  });

  it('offers no source picker until a table is connected', async () => {
    mockStores();
    const host = fakeNotionHost();

    renderGoalsWithNotion(host);

    await waitFor(() => expect(useNotionStore.getState().view.status).toBe('disconnected'));
    expect(screen.queryByRole('button', { name: PICKER })).toBeNull();
  });

  it('remembers the Notion choice once a table is connected', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores();

    renderGoalsWithNotion(connectedHost());
    await user.click(await screen.findByRole('button', { name: PICKER }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Notion' }));

    expect(updateSettings).toHaveBeenCalledWith({ goalsSource: 'notion' });
    expect(screen.queryByRole('menuitemradio', { name: 'Notion' })).toBeNull();
  });

  it('switches source from the compact header mark', async () => {
    const user = userEvent.setup();
    const { updateSettings } = mockStores({ goalViewMode: 'compact' });

    renderGoalsWithNotion(connectedHost());
    await user.click(await screen.findByRole('button', { name: PICKER }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Notion' }));

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

  it('folds open rows past five into a +N more line', async () => {
    const user = userEvent.setup();
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(connectedHost(notionItemFactory.buildList(8)));
    await user.click(await screen.findByRole('button', { name: '+3 more' }));

    expect(screen.getAllByRole('button', { name: /^Mark as complete: / })).toHaveLength(8);
  });

  it('shows a sixth open row rather than folding it', async () => {
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(connectedHost(notionItemFactory.buildList(6)));

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Mark as complete: / })).toHaveLength(6)
    );
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
  });

  it('names the Notion table in the compact header', async () => {
    mockStores({ goalsSource: 'notion', goalViewMode: 'compact' });

    renderGoalsWithNotion(connectedHost());

    expect(await screen.findByText('· Notion · Tasks')).toBeInTheDocument();
  });

  it('focuses on the first open Notion task, then hands over to the next', async () => {
    const user = userEvent.setup();
    mockStores({ goalsSource: 'notion', goalViewMode: 'focus' });
    const host = connectedHost([brief, draft, shipped]);

    renderGoalsWithNotion(host);
    await user.click(
      await screen.findByRole('button', { name: 'Mark as complete: Write the brief' })
    );

    expect(screen.queryByText('My focused goal')).toBeNull();
    expect(host.api.setNotionItemDone).toHaveBeenCalledExactlyOnceWith(brief.pageId, true);
    expect(
      await screen.findByRole('button', { name: 'Mark as complete: Review the draft' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 open in this table')).toBeInTheDocument();
  });

  it('says so once every Notion task in focus is done', async () => {
    mockStores({ goalsSource: 'notion', goalViewMode: 'focus' });

    renderGoalsWithNotion(connectedHost([shipped]));

    expect(await screen.findByText('Nothing left to do in this table.')).toBeInTheDocument();
  });

  it('retries a failed read from the card', async () => {
    const user = userEvent.setup();
    mockStores({ goalsSource: 'notion' });
    const host = connectedHost();
    host.api.listNotionItems.mockRejectedValueOnce(problem('internal'));

    renderGoalsWithNotion(host);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Write the brief')).toBeInTheDocument();
  });

  it('says when only the first rows are shown', async () => {
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(connectedHost([brief], true));

    expect(await screen.findByText('Showing the first 500 rows')).toBeInTheDocument();
  });

  it('points at Settings when Notion is no longer connected', async () => {
    const user = userEvent.setup();
    const onOpenIntegrations = vi.fn();
    mockStores({ goalsSource: 'notion' });

    renderGoalsWithNotion(fakeNotionHost(), { onOpenIntegrations });
    await user.click(await screen.findByRole('button', { name: 'Open Notion settings' }));

    expect(screen.getByText('Connect Notion to see its tasks here.')).toBeInTheDocument();
    expect(onOpenIntegrations).toHaveBeenCalledOnce();
  });
});
