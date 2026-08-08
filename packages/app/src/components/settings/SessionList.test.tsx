import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { controllerWith, renderSessionList, session } from './__fixtures__/session-list.fixtures';
import { SessionList } from './SessionList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError, success: toastSuccess, warning: vi.fn() }),
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
