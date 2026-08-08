import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SyncControllerContext } from '../../sync/sync-controller';
import { controllerWith, renderSessionList, session } from './__fixtures__/session-list.fixtures';
import { SessionList } from './SessionList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError, success: toastSuccess, warning: toastWarning }),
  },
}));

describe('SessionList', () => {
  it('renders nothing without a controller', () => {
    const { container } = render(<SessionList />);

    expect(container).toBeEmptyDOMElement();
  });

  it('badges the current session and gives it no revoke control', async () => {
    const controller = controllerWith([
      session({ id: 's1', deviceName: 'laptop', current: true }),
      session({ id: 's2', deviceName: 'desktop', current: false }),
    ]);
    renderSessionList(controller);

    const currentRow = await screen.findByTestId('session-row-s1');
    expect(within(currentRow).getByText('This device')).toBeInTheDocument();
    expect(within(currentRow).queryByRole('button', { name: /revoke/i })).toBeNull();

    const otherRow = screen.getByTestId('session-row-s2');
    expect(within(otherRow).getByRole('button', { name: /revoke/i })).toBeInTheDocument();
  });

  it('keeps two same-named sessions distinguishable by last active', async () => {
    const controller = controllerWith([
      session({ id: 's1', deviceName: 'MacBook', lastUsedAt: Date.now() - 60 * 60 * 1000 }),
      session({ id: 's2', deviceName: 'MacBook', lastUsedAt: Date.now() - 9 * 86_400_000 }),
    ]);
    renderSessionList(controller);

    expect(await screen.findByTestId('session-row-s1')).toBeInTheDocument();
    expect(screen.getByTestId('session-row-s2')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^session-last-active-/)).toHaveLength(2);
  });

  it('shows a quiet line rather than an error when the list is unavailable', async () => {
    renderSessionList(controllerWith(null));

    expect(await screen.findByTestId('session-list-unavailable')).toBeInTheDocument();
  });

  it('shows the unavailable line rather than a permanent skeleton if the read rejects', async () => {
    const controller = controllerWith([session({ id: 's1' })]);
    controller.failNext('listSessions');
    renderSessionList(controller);

    expect(await screen.findByTestId('session-list-unavailable')).toBeInTheDocument();
  });

  it('disables regeneration while one is already in flight', async () => {
    const controller = controllerWith([session({ id: 's2', deviceName: 'desktop' })]);
    render(
      <SyncControllerContext.Provider value={controller}>
        <SessionList onRegenerateRecoveryCode={vi.fn()} isRegeneratingRecoveryCode={true} />
      </SyncControllerContext.Provider>
    );

    await userEvent.click(await screen.findByRole('button', { name: /revoke/i }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByRole('button', { name: /regenerate recovery code/i })
    ).toBeDisabled();
  });

  // Without the generation guard the older read wins and puts the revoked device back on screen,
  // right after the toast said it was signed out.
  it('ignores a stale read that resolves after a newer one', async () => {
    const controller = controllerWith([
      session({ id: 's1', current: true }),
      session({ id: 's2', deviceName: 'desktop' }),
    ]);
    renderSessionList(controller);
    await screen.findByTestId('session-row-s2');

    // A status flip starts a read that hangs — this is the one that will land late.
    controller.deferNextSessions();
    await act(async () => {
      controller.setStatus('syncing');
    });

    // Meanwhile the user revokes, and that action's own refresh resolves normally.
    controller.sessionsResult = [session({ id: 's1', current: true })];
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^revoke$/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('session-row-s2')).toBeNull();
    });

    // The hung read now answers with the pre-revoke list; it must not resurrect the row.
    await act(async () => {
      controller.resolveSessions([
        session({ id: 's1', current: true }),
        session({ id: 's2', deviceName: 'desktop' }),
      ]);
    });

    expect(screen.queryByTestId('session-row-s2')).toBeNull();
  });

  it('retries the read from the unavailable line', async () => {
    const controller = controllerWith(null);
    renderSessionList(controller);

    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));

    expect(controller.calls.filter((c) => c.method === 'listSessions')).toHaveLength(2);
  });

  it('rejects a rename whose UTF-8 length exceeds the bound, without calling the server', async () => {
    const controller = controllerWith([session({ id: 's1', deviceName: 'laptop' })]);
    renderSessionList(controller);

    await userEvent.click(await screen.findByTestId('session-name-s1'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    // 40 CJK characters: 120 UTF-8 bytes but only 40 code units, so a code-unit cap would miss it.
    await userEvent.type(input, '設'.repeat(40));
    await userEvent.keyboard('{Enter}');

    expect(controller.calls.filter((c) => c.method === 'renameSession')).toHaveLength(0);
    // Silently refusing to save would leave the user retyping into a field that never commits.
    expect(toastWarning).toHaveBeenCalled();
  });

  it('accepts a name at exactly the byte bound', async () => {
    const controller = controllerWith([session({ id: 's1', deviceName: 'laptop' })]);
    renderSessionList(controller);

    await userEvent.click(await screen.findByTestId('session-name-s1'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'x'.repeat(100));
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(controller.calls.filter((c) => c.method === 'renameSession')).toHaveLength(1);
    });
  });

  // Mounting during 'connecting' would otherwise read before a session exists and pin the
  // unavailable line for the rest of the mount.
  it('waits for sync to be up before reading, then reads on the transition', async () => {
    const controller = controllerWith([session({ id: 's1' })]);
    controller.setStatus('connecting');
    renderSessionList(controller);

    expect(controller.calls.filter((c) => c.method === 'listSessions')).toHaveLength(0);

    controller.setStatus('active');

    expect(await screen.findByTestId('session-row-s1')).toBeInTheDocument();
  });

  it('renames a session and refreshes the list', async () => {
    const controller = controllerWith([session({ id: 's1', deviceName: 'laptop' })]);
    renderSessionList(controller);

    await userEvent.click(await screen.findByTestId('session-name-s1'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Work MacBook{Enter}');

    await waitFor(() => {
      expect(controller.calls.filter((c) => c.method === 'renameSession')).toHaveLength(1);
    });
    expect(controller.calls.find((c) => c.method === 'renameSession')?.args).toEqual([
      's1',
      'Work MacBook',
    ]);
    // Second listSessions: without the refresh the row keeps the stale name until a remount.
    expect(controller.calls.filter((c) => c.method === 'listSessions')).toHaveLength(2);
  });

  it('offers regeneration above the confirm and does not force it', async () => {
    const controller = controllerWith([session({ id: 's2', deviceName: 'desktop' })]);
    const onRegenerate = vi.fn();
    renderSessionList(controller, onRegenerate);

    await userEvent.click(await screen.findByRole('button', { name: /revoke/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/stays on that device/i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /regenerate recovery code/i })
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /^revoke$/i }));

    expect(onRegenerate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(controller.calls.filter((c) => c.method === 'revokeSession')).toHaveLength(1);
    });
    // Without the refresh the revoked device would linger in the list until a remount.
    expect(controller.calls.filter((c) => c.method === 'listSessions')).toHaveLength(2);
  });

  it('toasts when a revoke fails', async () => {
    const controller = controllerWith([session({ id: 's2', deviceName: 'desktop' })]);
    controller.failNext('revokeSession');
    renderSessionList(controller);

    await userEvent.click(await screen.findByRole('button', { name: /revoke/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^revoke$/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
  });

  it('refreshes after a failed revoke, so a row another device already cut cannot linger', async () => {
    const controller = controllerWith([session({ id: 's2', deviceName: 'desktop' })]);
    controller.failNext('revokeSession');
    renderSessionList(controller);

    await userEvent.click(await screen.findByRole('button', { name: /revoke/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^revoke$/i }));

    // Two listSessions: the mount read, then the one the failure path re-issues.
    await waitFor(() => {
      expect(controller.calls.filter((call) => call.method === 'listSessions')).toHaveLength(2);
    });
  });

  it('says a session used moments ago is active now, not "Last active Just now"', async () => {
    const controller = controllerWith([session({ id: 's1', lastUsedAt: Date.now() - 1000 })]);
    renderSessionList(controller);

    expect(await screen.findByText('Active now')).toBeInTheDocument();
    expect(screen.queryByText(/last active just now/i)).not.toBeInTheDocument();
  });

  it('reports the count after signing out all other devices', async () => {
    const controller = controllerWith([
      session({ id: 's1', current: true }),
      session({ id: 's2', current: false }),
    ]);
    controller.revokedOthersCount = 3;
    renderSessionList(controller);

    await userEvent.click(
      await screen.findByRole('button', { name: /sign out all other devices/i })
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^sign out$/i }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Signed out 3 other devices');
    });
  });

  it('hides the bulk action when this is the only device', async () => {
    renderSessionList(controllerWith([session({ id: 's1', current: true })]));

    expect(await screen.findByTestId('session-row-s1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out all other devices/i })).toBeNull();
  });

  it('toasts and re-reads the server name when a rename fails', async () => {
    const controller = controllerWith([session({ id: 's1', deviceName: 'laptop' })]);
    controller.failNext('renameSession');
    renderSessionList(controller);

    await userEvent.click(await screen.findByTestId('session-name-s1'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Work MacBook{Enter}');

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    // The refresh is what discards the failed edit; the row shows what the server still holds.
    expect(controller.calls.filter((c) => c.method === 'listSessions')).toHaveLength(2);
    expect(await screen.findByTestId('session-name-s1')).toHaveTextContent('laptop');
  });
});
