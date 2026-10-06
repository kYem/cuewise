import { logger } from '@cuewise/shared';
import { notionTableFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectedWithoutTable,
  connectedWithTable,
  fakeNotionHost,
  NOTION_RETURN_URI,
  problem,
  returnedWith,
  tablesOf,
} from '../notion/__fixtures__/notion-host.fixtures';
import { computeCodeChallenge } from '../utils/pkce';
import { type NotionView, useNotionStore } from './notion-store';

const errorToast = vi.fn();
const warningToast = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: errorToast, warning: warningToast, success: vi.fn() }),
  },
}));

const tasks = notionTableFactory.build({ name: 'Tasks' });

function pickingTasks(): NotionView {
  return {
    status: 'picking',
    workspace: 'Acme',
    tables: [tasks, notionTableFactory.build()],
    truncated: false,
    currentId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotionStore.setState({ view: { status: 'loading' }, busy: false });
});

describe('load', () => {
  it('shows disconnected when the account holds no grant', async () => {
    const host = fakeNotionHost();

    await useNotionStore.getState().load(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
  });

  it('shows the connected workspace and table without listing tables', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithTable);

    await useNotionStore.getState().load(host);

    expect(useNotionStore.getState().view).toEqual({
      status: 'connected',
      workspace: 'Acme',
      dataSourceId: connectedWithTable.dataSourceId,
      tableName: 'Tasks',
    });
    expect(host.api.listNotionTables).not.toHaveBeenCalled();
  });

  it('opens the picker when connected with no table chosen', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithoutTable);
    host.api.listNotionTables.mockResolvedValue(tablesOf(2, true));

    await useNotionStore.getState().load(host);

    expect(useNotionStore.getState().view).toMatchObject({
      status: 'picking',
      truncated: true,
      currentId: null,
    });
  });

  it('shows unavailable when the Cuewise session has expired', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockRejectedValue(problem('invalid_token'));

    await useNotionStore.getState().load(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'unavailable' });
  });

  it('shows failed, and logs it, when the connection cannot be read', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const host = fakeNotionHost();
    const thrown = problem('network_error');
    host.api.getNotionConnection.mockRejectedValue(thrown);

    await useNotionStore.getState().load(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to read the Notion connection or its tables',
      thrown
    );
  });
});

describe('connect', () => {
  it('starts consent with the challenge of the verifier it then claims with', async () => {
    const host = fakeNotionHost();

    await useNotionStore.getState().connect(host);

    const [returnUri, challenge] = host.api.startNotion.mock.calls[0] ?? [];
    const [code, verifier] = host.api.claimNotion.mock.calls[0] ?? [];
    expect(returnUri).toBe(NOTION_RETURN_URI);
    expect(code).toBe('one-time-code');
    expect(challenge).toBe(await computeCodeChallenge(verifier ?? ''));
  });

  it('picks the only shared table itself', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithoutTable);
    host.api.listNotionTables.mockResolvedValue({
      workspace: 'Acme',
      tables: [tasks],
      truncated: false,
    });

    await useNotionStore.getState().connect(host);

    expect(host.api.selectNotionTable).toHaveBeenCalledWith(tasks.id, 'Tasks');
    expect(useNotionStore.getState().view).toEqual({
      status: 'connected',
      workspace: 'Acme',
      dataSourceId: tasks.id,
      tableName: 'Tasks',
    });
  });

  it.each([
    ['several tables', tablesOf(2)],
    ['a truncated list of one', tablesOf(1, true)],
  ])('leaves %s to the picker', async (_label, found) => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithoutTable);
    host.api.listNotionTables.mockResolvedValue(found);

    await useNotionStore.getState().connect(host);

    expect(host.api.selectNotionTable).not.toHaveBeenCalled();
    expect(useNotionStore.getState().view).toMatchObject({ status: 'picking' });
  });

  it('goes back quietly when the user declines in Notion', async () => {
    useNotionStore.setState({ view: { status: 'disconnected' } });
    const host = fakeNotionHost(returnedWith({ error: 'access_denied' }));

    await useNotionStore.getState().connect(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
    expect(host.api.claimNotion).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
    expect(warningToast).not.toHaveBeenCalled();
  });

  it('says so, and goes back, when the consent window did not finish', async () => {
    useNotionStore.setState({ view: { status: 'disconnected' } });
    const host = fakeNotionHost(null);

    await useNotionStore.getState().connect(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
    expect(warningToast).toHaveBeenCalledWith("Connecting Notion didn't complete.");
  });

  it('goes back quietly when the user cancels from the app', async () => {
    useNotionStore.setState({ view: { status: 'disconnected' } });
    const host = { ...fakeNotionHost(null), cancel: vi.fn() };
    host.authorize.mockImplementation(async () => {
      useNotionStore.getState().cancelConnect(host);
      return null;
    });

    await useNotionStore.getState().connect(host);

    expect(host.cancel).toHaveBeenCalledTimes(1);
    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
    expect(warningToast).not.toHaveBeenCalled();
  });

  it('warns again when a connect after a cancelled one does not finish', async () => {
    useNotionStore.setState({ view: { status: 'disconnected' } });
    const host = { ...fakeNotionHost(null), cancel: vi.fn() };
    host.authorize.mockImplementationOnce(async () => {
      useNotionStore.getState().cancelConnect(host);
      return null;
    });
    await useNotionStore.getState().connect(host);

    await useNotionStore.getState().connect(host);

    expect(warningToast).toHaveBeenCalledWith("Connecting Notion didn't complete.");
  });

  it('reports a consent flow that failed, and goes back', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    useNotionStore.setState({ view: { status: 'disconnected' } });
    const host = fakeNotionHost();
    const thrown = new Error('Timed out waiting for the sign-in callback');
    host.authorize.mockRejectedValue(thrown);

    await useNotionStore.getState().connect(host);

    expect(errorSpy).toHaveBeenCalledWith("Couldn't connect Notion.", thrown);
    expect(errorToast).toHaveBeenCalledWith("Couldn't connect Notion.");
    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
  });

  it('claims nothing when Notion returned an error other than a decline', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    useNotionStore.setState({ view: { status: 'disconnected' } });
    const host = fakeNotionHost(returnedWith({ error: 'server_error' }));

    await useNotionStore.getState().connect(host);

    expect(host.api.claimNotion).not.toHaveBeenCalled();
    expect(errorToast).toHaveBeenCalledWith("Couldn't connect Notion. Please try again.");
    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
  });

  it('keeps a reconnect in place when the claim is refused', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    useNotionStore.setState({ view: { status: 'reauth' } });
    const host = fakeNotionHost();
    host.api.claimNotion.mockRejectedValue(problem('provider_claim_invalid'));

    await useNotionStore.getState().connect(host);

    expect(errorToast).toHaveBeenCalledWith("Couldn't connect Notion.");
    expect(useNotionStore.getState().view).toEqual({ status: 'reauth' });
  });

  it('shows unavailable when the session expired before consent could start', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const host = fakeNotionHost();
    host.api.startNotion.mockRejectedValue(problem('invalid_token'));

    await useNotionStore.getState().connect(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'unavailable' });
    expect(errorToast).not.toHaveBeenCalled();
  });
});

describe('pick', () => {
  it('stores the table with its name and shows it connected', async () => {
    useNotionStore.setState({ view: pickingTasks() });
    const host = fakeNotionHost();

    await useNotionStore.getState().pick(host, tasks);

    expect(host.api.selectNotionTable).toHaveBeenCalledWith(tasks.id, 'Tasks');
    expect(useNotionStore.getState().view).toEqual({
      status: 'connected',
      workspace: 'Acme',
      dataSourceId: tasks.id,
      tableName: 'Tasks',
    });
  });

  it('names a table with no usable completion property, and keeps the picker open', async () => {
    const picker = pickingTasks();
    useNotionStore.setState({ view: picker });
    const host = fakeNotionHost();
    host.api.selectNotionTable.mockRejectedValue(problem('provider_schema_unusable'));

    await useNotionStore.getState().pick(host, tasks);

    expect(errorToast).toHaveBeenCalledWith(
      '“Tasks” has no Complete status or Done checkbox to mark tasks with.'
    );
    expect(useNotionStore.getState().view).toEqual(picker);
  });

  it('refreshes the list when the picked table is no longer shared', async () => {
    useNotionStore.setState({ view: pickingTasks() });
    const host = fakeNotionHost();
    host.api.selectNotionTable.mockRejectedValue(problem('provider_table_unavailable'));
    host.api.listNotionTables.mockResolvedValue(tablesOf(3));

    await useNotionStore.getState().pick(host, tasks);

    expect(errorToast).toHaveBeenCalledWith('“Tasks” is no longer shared with Cuewise.');
    expect(useNotionStore.getState().view).toMatchObject({ status: 'picking' });
    expect(host.api.listNotionTables).toHaveBeenCalledTimes(1);
  });

  it('asks for a reconnect when Notion refused the grant', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    useNotionStore.setState({ view: pickingTasks() });
    const host = fakeNotionHost();
    host.api.selectNotionTable.mockRejectedValue(problem('provider_reauth_required'));

    await useNotionStore.getState().pick(host, tasks);

    expect(useNotionStore.getState().view).toEqual({ status: 'reauth' });
  });
});

describe('changeTable', () => {
  it('opens the picker and remembers the table still stored', async () => {
    useNotionStore.setState({
      view: { status: 'connected', workspace: 'Acme', dataSourceId: tasks.id, tableName: 'Tasks' },
    });
    const host = fakeNotionHost();

    await useNotionStore.getState().changeTable(host);

    expect(useNotionStore.getState().view).toMatchObject({
      status: 'picking',
      currentId: tasks.id,
    });
  });
});

describe('disconnect', () => {
  it('shows disconnected once the grant is gone', async () => {
    useNotionStore.setState({
      view: { status: 'connected', workspace: 'Acme', dataSourceId: tasks.id, tableName: 'Tasks' },
    });
    const host = fakeNotionHost();

    await useNotionStore.getState().disconnect(host);

    expect(useNotionStore.getState().view).toEqual({ status: 'disconnected' });
  });

  it('keeps the connection, and says Notion is not responding, on an upstream outage', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const connected: NotionView = {
      status: 'connected',
      workspace: 'Acme',
      dataSourceId: tasks.id,
      tableName: 'Tasks',
    };
    useNotionStore.setState({ view: connected });
    const host = fakeNotionHost();
    host.api.disconnectNotion.mockRejectedValue(problem('upstream_unavailable'));

    await useNotionStore.getState().disconnect(host);

    expect(errorToast).toHaveBeenCalledWith(
      "Notion isn't responding right now. Try again in a moment."
    );
    expect(useNotionStore.getState().view).toEqual(connected);
    expect(useNotionStore.getState().busy).toBe(false);
  });
});
