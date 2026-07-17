import { defaultSettings } from '@cuewise/test-utils';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSyncController } from '../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext } from '../../sync/sync-controller';
import { SyncSettingsSectionComponent } from './SyncSettingsSection';
import type { SettingsSectionProps } from './settings-types';

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError, success: toastSuccess, warning: toastWarning }),
  },
}));

const settingsMock = vi.hoisted(() => ({ syncEnabled: false, updateSettings: vi.fn() }));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { syncEnabled: settingsMock.syncEnabled },
      updateSettings: settingsMock.updateSettings,
    }),
  },
}));

const CODE = 'CW1-MWWJH-3K3QQ-R4RNB-JW1PV-8TRQT-PC14A-R5G5V';
const DISABLE_MESSAGE = 'Re-enabling on this device will need your recovery code.';

function sectionProps(overrides: Partial<SettingsSectionProps> = {}): SettingsSectionProps {
  return {
    s: defaultSettings,
    set: vi.fn(),
    filter: '',
    onReset: vi.fn(),
    onOpenSoundsPanel: vi.fn(),
    ...overrides,
  };
}

function renderSection(
  controller: FakeSyncController | null,
  overrides?: Partial<SettingsSectionProps>
) {
  const props = sectionProps(overrides);
  if (controller === null) {
    return render(<SyncSettingsSectionComponent {...props} />);
  }
  return render(
    <SyncControllerContext.Provider value={controller}>
      <SyncSettingsSectionComponent {...props} />
    </SyncControllerContext.Provider>
  );
}

const cloudSyncSwitch = () => screen.getByRole('checkbox', { name: 'Cloud Sync' });

const enterEnableStep = async (user: ReturnType<typeof userEvent.setup>, accountId: string) => {
  await user.click(cloudSyncSwitch());
  await user.type(screen.getByLabelText('Account ID'), accountId);
};

describe('SyncSettingsSectionComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.syncEnabled = false;
    settingsMock.updateSettings.mockImplementation(
      async (partial: Partial<{ syncEnabled: boolean }>) => {
        if (partial.syncEnabled !== undefined) {
          settingsMock.syncEnabled = partial.syncEnabled;
        }
      }
    );
  });

  it('renders nothing when there is no controller in context', () => {
    const { container } = renderSection(null);
    expect(container.firstChild).toBeNull();
  });

  it('hides entirely when the filter does not match cloud sync search terms', () => {
    const controller = new FakeSyncController();
    renderSection(controller, { filter: 'timer duration' });
    expect(screen.queryByRole('checkbox', { name: 'Cloud Sync' })).not.toBeInTheDocument();
  });

  it('renders the Cloud Sync switch, unchecked, when status is off', () => {
    const controller = new FakeSyncController();
    renderSection(controller);
    expect(cloudSyncSwitch()).not.toBeChecked();
  });

  it('shows account id and device name inputs after toggling the switch on', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    expect(screen.getByLabelText('Account ID')).toBeInTheDocument();
    const deviceNameInput = screen.getByLabelText('Device name') as HTMLInputElement;
    expect(deviceNameInput.value.length).toBeGreaterThan(0);
  });

  it('shows the Sign in with Google button after toggling the switch on', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('hides the Sign in with Google button when the controller reports it unavailable', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.googleAvailable = false;
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Device name')).toBeInTheDocument();
  });

  it('calls controller.enableWithGoogle with the device name when Sign in with Google is clicked', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    const deviceNameInput = screen.getByLabelText('Device name') as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() =>
      expect(controller.calls).toContainEqual({
        method: 'enableWithGoogle',
        args: [deviceNameInput.value, undefined],
      })
    );
  });

  it('opens RecoveryCodeModal with the returned code when Google sign-in succeeds with a recovery code', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: true, recoveryCode: CODE });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(await screen.findByText('Save your recovery code')).toBeInTheDocument();
    for (const group of CODE.split('-')) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it('shows a toast error when Google sign-in fails', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'auth' });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('treats a cancelled Google sign-in as a non-error: no toast, form stays open', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'auth', detail: 'cancelled' });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    // The button settles back to idle for another attempt, with no error surfaced.
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still toasts an auth failure that carries a non-cancel detail', async () => {
    // Pins the exact-match: loosening `detail === 'cancelled'` to a truthy check would
    // silently swallow real auth failures the moment a producer attaches a diagnostic detail.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'auth', detail: 'token-expired' });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('routes a recovery code that resolves after unmount to a warning toast, never dropping it', async () => {
    // Settings can close during the minutes-long macOS browser dance; the show-once code must
    // surface SOMEWHERE — as a global toast telling the user to regenerate one.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextEnableWithGoogle();
    const { unmount } = renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    unmount();
    act(() => controller.resolveEnableWithGoogle({ ok: true, recoveryCode: CODE }));

    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('treats a cancelled reconnect as a non-error: no toast, Reconnect stays available', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'auth', detail: 'cancelled' });
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('keeps the enroll modal open with no error line when the re-auth is cancelled', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'needs-code' });
    controller.scriptEnableWithGoogle({ ok: false, reason: 'auth', detail: 'cancelled' });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await screen.findByText('Enter recovery code');
    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    // Modal stays open for another attempt; a deliberate cancel shows no failure message.
    expect(await screen.findByRole('button', { name: 'Enroll' })).toBeEnabled();
    expect(screen.getByText('Enter recovery code')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('turns Chrome sync off (migrating to local) after a successful enable', async () => {
    const user = userEvent.setup();
    settingsMock.syncEnabled = true;
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true });
    renderSection(controller);

    await enterEnableStep(user, 'acct');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() =>
      expect(settingsMock.updateSettings).toHaveBeenCalledWith({ syncEnabled: false })
    );
    expect(controller.calls.some((c) => c.method === 'enable')).toBe(true);
  });

  it('does not migrate when Chrome sync is already off', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true });
    renderSection(controller);

    await enterEnableStep(user, 'acct');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(controller.calls.some((c) => c.method === 'enable')).toBe(true));
    expect(settingsMock.updateSettings).not.toHaveBeenCalled();
  });

  it('leaves Chrome sync untouched when the enable attempt fails', async () => {
    const user = userEvent.setup();
    settingsMock.syncEnabled = true;
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'error' });
    renderSection(controller);

    await enterEnableStep(user, 'acct');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(controller.calls.some((c) => c.method === 'enable')).toBe(true));
    expect(settingsMock.updateSettings).not.toHaveBeenCalled();
  });

  it('shows a spinner and disables the button while Google sign-in is pending', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextEnableWithGoogle();
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    const pendingButton = await screen.findByRole('button', { name: /signing in/i });
    expect(pendingButton).toBeDisabled();

    act(() => controller.resolveEnableWithGoogle({ ok: true }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /signing in/i })).not.toBeInTheDocument()
    );
  });

  it('only renders the dev-only Account ID enable path in dev builds', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    if (import.meta.env.DEV) {
      expect(screen.getByLabelText('Account ID')).toBeInTheDocument();
    } else {
      expect(screen.queryByLabelText('Account ID')).not.toBeInTheDocument();
    }
  });

  it('opens RecoveryCodeModal with the returned code when enable succeeds with a recovery code', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true, recoveryCode: CODE });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    expect(await screen.findByText('Save your recovery code')).toBeInTheDocument();
    for (const group of CODE.split('-')) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it('opens EnrollCodeModal when enable returns needs-code', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'needs-code' });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    expect(await screen.findByText('Enter recovery code')).toBeInTheDocument();
  });

  it('shows a toast error when enable fails with a bad-code reason', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'bad-code' });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Enter recovery code')).not.toBeInTheDocument();
  });

  it('shows a toast error when enable fails with an auth reason', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'auth' });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('shows a toast error when enable fails with a generic error reason', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'error', detail: 'network down' });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0]?.[0]).not.toContain('network down');
  });

  it('shows a Reconnect button when status is needs_reauth', () => {
    const controller = new FakeSyncController();
    renderSection(controller);

    act(() => controller.setStatus('needs_reauth'));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('opens EnrollCodeModal when reconnect returns needs-code', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'needs-code' });
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(await screen.findByText('Enter recovery code')).toBeInTheDocument();
  });

  it('routes the reconnect→needs-code enroll submit through reconnect(code), never enable', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'needs-code' });
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    await screen.findByText('Enter recovery code');
    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(controller.calls).toContainEqual({ method: 'reconnect', args: [CODE] })
    );
    expect(controller.calls.some((call) => call.method === 'enable')).toBe(false);
  });

  it('routes the google→needs-code enroll submit through enableWithGoogle(code), never enable', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'needs-code' });
    controller.scriptEnableWithGoogle({ ok: true });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    const deviceName = (screen.getByLabelText('Device name') as HTMLInputElement).value;
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await screen.findByText('Enter recovery code');
    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(controller.calls).toContainEqual({
        method: 'enableWithGoogle',
        args: [deviceName, CODE],
      })
    );
    expect(controller.calls.some((call) => call.method === 'enable')).toBe(false);
    expect(controller.calls.some((call) => call.method === 'reconnect')).toBe(false);
  });

  it('shows the confirm dialog with the recovery-code warning when the on-state switch is toggled off', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(cloudSyncSwitch());

    expect(screen.getByText(DISABLE_MESSAGE)).toBeInTheDocument();
  });

  it('confirming disable calls controller.disable()', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(controller.calls).toContainEqual({ method: 'disable', args: [] }));
  });

  it('shows the unsaved-code banner after RecoveryCodeModal is cancelled unsaved, and steers the disable copy to regenerate first', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true, recoveryCode: CODE });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    await screen.findByText('Save your recovery code');
    await user.click(screen.getByLabelText('Close modal'));

    expect(screen.getByTestId('unsaved-code-banner')).toBeInTheDocument();

    act(() => controller.setStatus('active'));
    await user.click(cloudSyncSwitch());

    expect(screen.queryByText(DISABLE_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText(/regenerate and save one first/i)).toBeInTheDocument();
  });

  it('clears the unsaved-code banner once RecoveryCodeModal is saved', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true, recoveryCode: CODE });
    renderSection(controller);

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    await screen.findByText('Save your recovery code');
    await user.type(screen.getByLabelText(/group 3/i), '3K3QQ');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByTestId('unsaved-code-banner')).not.toBeInTheDocument();
  });

  it('tracks the pill text through status changes', () => {
    const controller = new FakeSyncController();
    renderSection(controller);

    act(() => controller.setStatus('connecting'));
    expect(screen.getByTestId('sync-status-pill')).toHaveTextContent('Connecting…');

    act(() => controller.setStatus('syncing'));
    expect(screen.getByTestId('sync-status-pill')).toHaveTextContent('Syncing…');

    act(() => controller.setStatus('active'));
    expect(screen.getByTestId('sync-status-pill')).toHaveTextContent('Active');
  });

  it('shows the account email and last-synced time once the section is active', async () => {
    const controller = new FakeSyncController();
    controller.scriptDetails({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: Date.now() - 2 * 60_000,
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-account-label')).toHaveTextContent(
      'Signed in as kes@example.com'
    );
    expect(screen.getByTestId('sync-device-label')).toHaveTextContent(/Last synced 2 min ago/);
  });

  it('falls back to a short account id when no email is verified', async () => {
    const controller = new FakeSyncController();
    controller.scriptDetails({
      accountEmail: null,
      accountId: '1b0dc90d-f95f-4ba8',
      lastSyncedAt: null,
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-account-label')).toHaveTextContent('Account: 1b0dc90d…');
    expect(screen.getByTestId('sync-device-label')).not.toHaveTextContent('Last synced');
  });

  it('renders no account line when details are unavailable', async () => {
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await waitFor(() =>
      expect(controller.calls).toContainEqual({ method: 'getDetails', args: [] })
    );
    expect(screen.queryByTestId('sync-account-label')).not.toBeInTheDocument();
  });

  it('drops the shown identity on disable so a re-enable fetches fresh details', async () => {
    // Same mount, different account: the section must never keep showing the previous owner.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptDetails({ accountEmail: 'a@example.com', accountId: 'a', lastSyncedAt: null });
    controller.scriptDetails({ accountEmail: 'b@example.com', accountId: 'b', lastSyncedAt: null });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText('Signed in as a@example.com');

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));
    await waitFor(() => expect(screen.queryByTestId('sync-account-label')).not.toBeInTheDocument());
    act(() => controller.setStatus('active'));

    expect(await screen.findByText('Signed in as b@example.com')).toBeInTheDocument();
  });

  it('refreshes the last-synced time after Sync now', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    const details = { accountEmail: 'kes@example.com', accountId: 'user-1' };
    controller.scriptDetails({ ...details, lastSyncedAt: Date.now() - 3 * 60 * 60_000 });
    controller.scriptDetails({ ...details, lastSyncedAt: Date.now() });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-account-label');

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() =>
      expect(screen.getByTestId('sync-device-label')).toHaveTextContent(/Last synced Just now/)
    );
  });

  it('calls controller.syncNow() when Sync now is clicked', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(controller.calls).toContainEqual({ method: 'syncNow', args: [] }));
  });

  it('shows a success toast when Sync now resolves', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Synced'));
  });

  it('re-runs enable (never syncNow) when Try again is clicked after a failed enable', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'error' });
    renderSection(controller);

    await enterEnableStep(user, 'retry-acct');
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    // The engine surfaces the enable failure as the error status.
    act(() => controller.setStatus('error'));

    controller.scriptEnable({ ok: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'enable')).toHaveLength(2)
    );
    expect(controller.calls.some((c) => c.method === 'syncNow')).toBe(false);
  });

  it('re-runs Google sign-in (not reconnect) when Try again is clicked after a failed Google sign-in', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'error' });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    // The engine surfaces the sign-in failure as the error status.
    act(() => controller.setStatus('error'));

    controller.scriptEnableWithGoogle({ ok: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'enableWithGoogle')).toHaveLength(2)
    );
    expect(controller.calls.some((c) => c.method === 'reconnect')).toBe(false);
  });

  it('retries via reconnect (not enable with an empty account) when it mounts straight into error', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    // A persisted error hydrated on mount — no in-session failure set failedAction, and there is
    // no form account id, so retrying enable would send an empty account. Reconnect is the fallback.
    controller.setStatus('error');
    controller.scriptReconnect({ ok: true });
    renderSection(controller);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(controller.calls.some((c) => c.method === 'reconnect')).toBe(true));
    expect(controller.calls.some((c) => c.method === 'enable')).toBe(false);
  });

  it('re-runs reconnect (never syncNow) when Try again is clicked after a failed reconnect', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'error' });
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    act(() => controller.setStatus('error'));

    controller.scriptReconnect({ ok: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'reconnect')).toHaveLength(2)
    );
    expect(controller.calls.some((c) => c.method === 'syncNow')).toBe(false);
  });

  it('regenerates the recovery code and reopens RecoveryCodeModal with the new code', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Regenerate recovery code' }));

    expect(await screen.findByText('Save your recovery code')).toBeInTheDocument();
    expect(controller.calls).toContainEqual({ method: 'regenerateRecoveryCode', args: [] });
  });

  it("EnrollCodeModal's onSubmit calls controller.enable with the collected account id, device name, and code", async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'needs-code' });
    renderSection(controller);

    await enterEnableStep(user, 'acct-99');
    const deviceInput = screen.getByLabelText('Device name');
    await user.clear(deviceInput);
    await user.type(deviceInput, 'MyMac');
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    await screen.findByText('Enter recovery code');

    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(controller.calls).toContainEqual({
        method: 'enable',
        args: ['acct-99', 'MyMac', CODE],
      })
    );
  });

  it('pre-fills the device name from a recognizable user agent', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    expect(screen.getByLabelText('Device name')).toHaveValue('Mac');
  });

  it('falls back to "This device" when the user agent is unrecognizable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'some-unknown-agent',
      configurable: true,
    });
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    expect(screen.getByLabelText('Device name')).toHaveValue('This device');
  });

  it('shows a toast error when controller.regenerateRecoveryCode() rejects', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.failNext('regenerateRecoveryCode');
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Regenerate recovery code' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Save your recovery code')).not.toBeInTheDocument();
  });

  it('shows a toast error when controller.syncNow() rejects', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.failNext('syncNow');
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('shows the ConfirmationDialog loading state while disable() is pending, then clears it', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextDisable();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    expect(await screen.findByText('Processing...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    act(() => controller.resolveDisable());

    await waitFor(() => expect(screen.queryByText(DISABLE_MESSAGE)).not.toBeInTheDocument());
  });

  it('shows a toast error and closes the confirm dialog when controller.disable() rejects', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.failNext('disable');
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(DISABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows a toast error and clears the reconnecting state when controller.reconnect() rejects', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.failNext('reconnect');
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const reconnectButton = await screen.findByRole('button', { name: 'Reconnect' });
    expect(reconnectButton).toBeEnabled();
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
  });
});
