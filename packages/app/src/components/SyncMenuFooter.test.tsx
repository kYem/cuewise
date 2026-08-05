import { logger } from '@cuewise/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeSyncController } from '../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext } from '../sync/sync-controller';
import { SyncMenuFooter } from './SyncMenuFooter';

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock('../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError, success: toastSuccess, warning: toastWarning }),
  },
}));

function renderFooter(controller: FakeSyncController | null, onOpenSettings = vi.fn()) {
  if (controller === null) {
    return render(<SyncMenuFooter onOpenSettings={onOpenSettings} />);
  }
  return render(
    <SyncControllerContext.Provider value={controller}>
      <SyncMenuFooter onOpenSettings={onOpenSettings} />
    </SyncControllerContext.Provider>
  );
}

describe('SyncMenuFooter', () => {
  it('renders nothing when sync is not configured', () => {
    const { container } = renderFooter(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the user is not signed in', () => {
    const controller = new FakeSyncController();

    const { container } = renderFooter(controller);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the account and how long ago it synced', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('active');
    controller.scriptDetails({
      accountEmail: 'someone@example.com',
      accountId: 'acct-1',
      lastSyncedAt: Date.now() - 7 * 60_000,
    });

    renderFooter(controller);

    expect(await screen.findByText('someone@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Synced .*ago/)).toBeInTheDocument();
  });

  it('syncs when the row is pressed, and refreshes what it shows', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('active');
    controller.scriptDetails({
      accountEmail: 'someone@example.com',
      accountId: 'acct-1',
      lastSyncedAt: Date.now() - 7 * 60_000,
    });
    controller.scriptDetails({
      accountEmail: 'someone@example.com',
      accountId: 'acct-1',
      lastSyncedAt: Date.now(),
    });
    renderFooter(controller);
    await screen.findByText('someone@example.com');

    fireEvent.click(screen.getByTestId('sync-menu-footer'));

    await waitFor(() =>
      expect(controller.calls.filter((call) => call.method === 'syncNow')).toHaveLength(1)
    );
    expect(controller.calls.filter((call) => call.method === 'getDetails')).toHaveLength(2);
  });

  it('shows progress from its own click, not only from an adapter status', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('active');
    controller.scriptDetails({
      accountEmail: 'a@b.c',
      accountId: 'acct-1',
      lastSyncedAt: Date.now(),
    });
    controller.deferNextSyncNow();
    renderFooter(controller);
    await screen.findByText('a@b.c');

    fireEvent.click(screen.getByTestId('sync-menu-footer'));

    // Status stays 'active' throughout — the extension bridge never emits 'syncing'.
    expect(await screen.findByText('Syncing…')).toBeInTheDocument();
    controller.resolveSyncNow({ kind: 'synced' });
  });

  it.each([
    'needs_reauth',
    'needs_enroll',
  ] as const)('sends the user to settings for %s instead of offering a sync', async (status) => {
    const onOpenSettings = vi.fn();
    const controller = new FakeSyncController();
    controller.setStatus(status);
    controller.scriptDetails({ accountEmail: 'a@b.c', accountId: 'acct-1', lastSyncedAt: null });
    renderFooter(controller, onOpenSettings);

    fireEvent.click(await screen.findByTestId('sync-menu-footer'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(controller.calls.some((call) => call.method === 'syncNow')).toBe(false);
  });

  it('holds the email row open while the details fetch is in flight', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('active');
    controller.deferNextDetails();

    renderFooter(controller);

    expect(await screen.findByTestId('sync-menu-email-skeleton')).toBeInTheDocument();

    await act(async () => {
      controller.resolveDetails({
        accountEmail: 'kes@example.com',
        accountId: 'acct-1',
        lastSyncedAt: null,
      });
    });

    expect(screen.getByText('kes@example.com')).toBeInTheDocument();
    expect(screen.queryByTestId('sync-menu-email-skeleton')).not.toBeInTheDocument();
  });

  it('gives the row an accessible name that matches what it shows', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('active');
    controller.scriptDetails({
      accountEmail: 'someone@example.com',
      accountId: 'acct-1',
      lastSyncedAt: Date.now() - 7 * 60_000,
    });
    renderFooter(controller);
    await screen.findByText('someone@example.com');

    const row = screen.getByTestId('sync-menu-footer');

    expect(row).toHaveAccessibleName(
      /Cloud sync: signed in as someone@example\.com, synced .*ago\. Select to sync now\./
    );
  });

  it('says the row opens settings, not that it syncs, when reauth is needed', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('needs_reauth');

    renderFooter(controller);

    const row = await screen.findByTestId('sync-menu-footer');
    expect(row).toHaveAccessibleName(/Select to open settings\./);
    const accessibleName = row.getAttribute('aria-label') ?? '';
    expect(accessibleName).not.toMatch(/select to sync now/i);
  });

  it('logs and toasts when syncNow rejects, and leaves the row usable again', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    controller.setStatus('active');
    controller.scriptDetails({
      accountEmail: 'a@b.c',
      accountId: 'acct-1',
      lastSyncedAt: Date.now() - 60_000,
    });
    controller.failNext('syncNow');
    renderFooter(controller);
    await screen.findByText('a@b.c');

    fireEvent.click(screen.getByTestId('sync-menu-footer'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't sync right now — please try again.")
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cloud sync sync-now failed'),
      expect.any(Error)
    );
    expect(screen.getByTestId('sync-menu-footer')).not.toBeDisabled();
  });

  it('shows a settings icon rather than the refresh icon when settings-routing is needed', async () => {
    const controller = new FakeSyncController();
    controller.setStatus('needs_reauth');

    const { container } = renderFooter(controller);
    await screen.findByTestId('sync-menu-footer');

    expect(container.querySelector('.lucide-settings')).toBeInTheDocument();
    expect(container.querySelector('.lucide-refresh-cw')).not.toBeInTheDocument();
  });

  it('keeps a fresher details paint when an older status-transition fetch resolves late', async () => {
    const controller = new FakeSyncController();
    controller.emitsSyncingDuringSyncNow = true;
    controller.setStatus('active');
    controller.scriptDetails({
      accountEmail: 'a@b.c',
      accountId: 'acct-1',
      lastSyncedAt: Date.now() - 60 * 60_000,
    });
    renderFooter(controller);
    await screen.findByText('a@b.c');

    // syncNow() flips status to 'syncing' synchronously (macOS-style), starting a details fetch —
    // held back so it is still the OLDEST in-flight fetch when it finally resolves, below.
    controller.deferNextDetails();
    controller.deferNextSyncNow();
    fireEvent.click(screen.getByTestId('sync-menu-footer'));

    await waitFor(() =>
      expect(controller.calls.filter((call) => call.method === 'getDetails')).toHaveLength(2)
    );

    // What the back-to-active transition and the click's own refresh will each see.
    controller.scriptDetails({
      accountEmail: 'a@b.c',
      accountId: 'acct-1',
      lastSyncedAt: Date.now(),
    });
    controller.scriptDetails({
      accountEmail: 'a@b.c',
      accountId: 'acct-1',
      lastSyncedAt: Date.now(),
    });
    await act(async () => {
      controller.resolveSyncNow({ kind: 'synced' });
    });

    expect(await screen.findByText(/Synced (Just now|0 min ago)/)).toBeInTheDocument();

    await act(async () => {
      controller.resolveDetails({
        accountEmail: 'STALE@EXAMPLE.COM',
        accountId: 'acct-1',
        lastSyncedAt: null,
      });
    });

    expect(screen.queryByText('STALE@EXAMPLE.COM')).not.toBeInTheDocument();
    expect(screen.getByText('a@b.c')).toBeInTheDocument();
  });
});
