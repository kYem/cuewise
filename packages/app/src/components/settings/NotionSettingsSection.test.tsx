import { notionTableFactory } from '@cuewise/test-utils/factories';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancellableNotionHost,
  connectedWithoutTable,
  connectedWithTable,
  fakeNotionHost,
} from '../../notion/__fixtures__/notion-host.fixtures';
import { useNotionStore } from '../../stores/notion-store';
import { renderNotionSection } from './__fixtures__/notion-settings.fixtures';

const warningToast = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: { getState: () => ({ error: vi.fn(), warning: warningToast, success: vi.fn() }) },
}));

beforeEach(() => {
  warningToast.mockClear();
  useNotionStore.setState({ view: { status: 'loading' }, busy: false });
});

describe('Notion settings', () => {
  it('asks for Cloud Sync, and reads nothing, while signed out', () => {
    const host = fakeNotionHost();

    renderNotionSection(host, 'off');

    expect(screen.getByText('Turn on Cloud Sync to connect Notion.')).toBeInTheDocument();
    expect(host.api.getNotionConnection).not.toHaveBeenCalled();
  });

  it('reads the connection once sync signs in', async () => {
    const host = fakeNotionHost();
    const { controller } = renderNotionSection(host, 'off');

    act(() => {
      controller.setStatus('active');
    });

    expect(await screen.findByRole('button', { name: 'Connect Notion' })).toBeInTheDocument();
    expect(host.api.getNotionConnection).toHaveBeenCalledTimes(1);
  });

  it('names the connected workspace and table', async () => {
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithTable);

    renderNotionSection(host);

    expect(await screen.findByText('Connected to Acme · Tasks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change table' })).toBeInTheDocument();
  });

  it('connects from the button and lands on the only shared table', async () => {
    const user = userEvent.setup();
    const host = fakeNotionHost();
    host.api.listNotionTables.mockResolvedValue({
      workspace: 'Acme',
      tables: [notionTableFactory.build({ name: 'Tasks' })],
      truncated: false,
    });
    host.api.getNotionConnection
      .mockResolvedValueOnce(null)
      .mockResolvedValue(connectedWithoutTable);
    renderNotionSection(host);
    await user.click(await screen.findByRole('button', { name: 'Connect Notion' }));

    await waitFor(() => {
      expect(screen.getByText('Connected to Acme · Tasks')).toBeInTheDocument();
    });
    expect(host.authorize).toHaveBeenCalledTimes(1);
  });

  it('stores the table chosen in the picker', async () => {
    const user = userEvent.setup();
    const [inbox, projects] = notionTableFactory.buildList(2);
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithoutTable);
    host.api.listNotionTables.mockResolvedValue({
      workspace: 'Acme',
      tables: [inbox, projects],
      truncated: false,
    });
    renderNotionSection(host);

    await user.selectOptions(await screen.findByLabelText('Notion table'), projects.id);
    await user.click(screen.getByRole('button', { name: 'Use this table' }));

    expect(host.api.selectNotionTable).toHaveBeenCalledWith(projects.id, projects.name);
    expect(inbox.id).not.toBe(projects.id);
  });

  it('preselects the stored table when changing it', async () => {
    const user = userEvent.setup();
    const [inbox, projects] = notionTableFactory.buildList(2);
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue({
      workspace: 'Acme',
      dataSourceId: projects.id,
      tableName: projects.name,
    });
    host.api.listNotionTables.mockResolvedValue({
      workspace: 'Acme',
      tables: [inbox, projects],
      truncated: false,
    });
    renderNotionSection(host);

    await user.click(await screen.findByRole('button', { name: 'Change table' }));

    expect(await screen.findByLabelText('Notion table')).toHaveValue(projects.id);
  });

  it('leaves a connect in flight alone when the section remounts', () => {
    const host = fakeNotionHost();
    useNotionStore.setState({ view: { status: 'connecting' }, busy: true });

    renderNotionSection(host);

    expect(host.api.getNotionConnection).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
  });

  it('cancels a connect quietly when the host can abandon one', async () => {
    const user = userEvent.setup();
    const host = cancellableNotionHost();
    renderNotionSection(host);
    await user.click(await screen.findByRole('button', { name: 'Connect Notion' }));

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('button', { name: 'Connect Notion' })).toBeInTheDocument();
    expect(warningToast).not.toHaveBeenCalled();
  });

  it('offers no Cancel during a connect when the host cannot abandon one', () => {
    useNotionStore.setState({ view: { status: 'connecting' }, busy: true });

    renderNotionSection(fakeNotionHost());

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('counts a session that still needs its recovery code as signed in', async () => {
    const host = fakeNotionHost();

    renderNotionSection(host, 'needs_enroll');

    expect(await screen.findByRole('button', { name: 'Connect Notion' })).toBeInTheDocument();
  });

  it('disconnects, and offers to connect again', async () => {
    const user = userEvent.setup();
    const host = fakeNotionHost();
    host.api.getNotionConnection.mockResolvedValue(connectedWithTable);
    renderNotionSection(host);

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));

    expect(host.api.disconnectNotion).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Connect Notion' })).toBeInTheDocument();
  });
});
