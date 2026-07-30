import { logger } from '@cuewise/shared';
import type { SyncFailureReason } from '@cuewise/sync-engine';
import { defaultSettings } from '@cuewise/test-utils';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const INCOMPLETE_MESSAGE = "Sync didn't complete — your data is safe on this device.";
const DEVICE_FAILURE_MESSAGE =
  "Cloud Sync couldn't finish on this device. Your data is safe here and it will keep retrying.";

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
        return true;
      }
    );
  });

  // afterEach (not beforeEach) so a DEV stub can't outlive its test even if it were the file's last.
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('offers Cancel while Google sign-in is pending, settling it as a quiet cancel', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextEnableWithGoogle();
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel sign-in' }));

    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    expect(controller.calls).toContainEqual({ method: 'cancelEnableWithGoogle', args: [] });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('hides Cancel on a host that cannot abort sign-in (extension popup is user-closable)', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController().withoutHostCancel();
    controller.deferNextEnableWithGoogle();
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    // Sign-in is pending, but with no cancelEnableWithGoogle the UI must not offer a dead button.
    await waitFor(() =>
      expect(controller.calls.some((c) => c.method === 'enableWithGoogle')).toBe(true)
    );
    expect(screen.queryByRole('button', { name: 'Cancel sign-in' })).not.toBeInTheDocument();
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

  it('ignores a stale details fetch that resolves after disable, never showing the old account', async () => {
    // A slow getDetails for account A must not clobber the display after a disable → re-enable.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextDetails(); // fetch A hangs
    controller.scriptDetails({ accountEmail: 'b@example.com', accountId: 'b', lastSyncedAt: null });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    // Disable, then re-enable → fetch B resolves with account B.
    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));
    act(() => controller.setStatus('active'));
    expect(await screen.findByText('Signed in as b@example.com')).toBeInTheDocument();

    // Now the stale account-A fetch finally resolves — it must be dropped, not painted. `await
    // act(async)` so the resolution's microtask actually runs before the assertions (a sync act()
    // would leave the handler unrun, passing even with the generation guard deleted).
    await act(async () => {
      controller.resolveDetails({
        accountEmail: 'a@example.com',
        accountId: 'a',
        lastSyncedAt: null,
      });
    });
    expect(screen.getByText('Signed in as b@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Signed in as a@example.com')).not.toBeInTheDocument();
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
    controller.scriptEnrollWithCode({ ok: false, reason: 'auth', detail: 'cancelled' });
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

  it('warns when Chrome sync could not be turned off after a successful enable', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    settingsMock.syncEnabled = true;
    settingsMock.updateSettings.mockResolvedValue(false);
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true });
    renderSection(controller);

    await enterEnableStep(user, 'acct');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('Chrome sync'))
    );
    expect(errorSpy).toHaveBeenCalled();
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

  it('hides the dev-only Account ID enable path in production builds', async () => {
    // Stub the flag rather than branching on it: Vitest always runs with DEV=true, so an
    // `if (import.meta.env.DEV)` here would only ever assert the dev case and the production
    // guard would be pinned by nothing — letting the account-id sign-in path ship.
    vi.stubEnv('DEV', false);
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);

    await user.click(cloudSyncSwitch());

    expect(screen.queryByLabelText('Account ID')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
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

  it('routes the google→needs-code enroll submit through enrollWithCode (no second bounce), never enable', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'needs-code' });
    controller.scriptEnrollWithCode({ ok: true });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    const deviceName = (screen.getByLabelText('Device name') as HTMLInputElement).value;
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await screen.findByText('Enter recovery code');
    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(controller.calls).toContainEqual({
        method: 'enrollWithCode',
        args: [deviceName, CODE],
      })
    );
    // The needs-code enroll must NOT re-run the browser bounce, enable, or reconnect.
    expect(controller.calls.filter((call) => call.method === 'enableWithGoogle')).toHaveLength(1);
    expect(controller.calls.some((call) => call.method === 'enable')).toBe(false);
    expect(controller.calls.some((call) => call.method === 'reconnect')).toBe(false);
  });

  it('falls back to enableWithGoogle for enroll when the host lacks enrollWithCode (extension)', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController().withoutHostEnroll();
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
    expect(controller.calls.some((call) => call.method === 'enrollWithCode')).toBe(false);
  });

  it('falls back to full re-auth when enrollWithCode reports the session is gone', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: false, reason: 'needs-code' });
    controller.scriptEnrollWithCode({ ok: false, reason: 'auth' }); // session died mid-enroll
    controller.scriptEnableWithGoogle({ ok: true }); // the re-auth succeeds
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    const deviceName = (screen.getByLabelText('Device name') as HTMLInputElement).value;
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await screen.findByText('Enter recovery code');
    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    // Resume was tried once, then the full re-auth carried the enroll through — no dead-end.
    await waitFor(() =>
      expect(controller.calls).toContainEqual({
        method: 'enableWithGoogle',
        args: [deviceName, CODE],
      })
    );
    expect(controller.calls.filter((c) => c.method === 'enrollWithCode')).toHaveLength(1);
    expect(toastError).not.toHaveBeenCalled();
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

  it('fetches details once per mount, not on every active/syncing flip', async () => {
    // A "Sync now" click flips active → syncing → active on hosts that report 'syncing' (macOS
    // only — the engine has no such status; the extension's mapToUi never emits it). Without the
    // latch that flip re-fires the effect and duplicates the getDetails handleSyncNow already
    // issues. (An unavailable result deliberately re-arms it — see below.)
    const controller = new FakeSyncController();
    controller.scriptDetails({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: null,
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText('Signed in as kes@example.com');

    act(() => controller.setStatus('syncing'));
    act(() => controller.setStatus('active'));

    expect(controller.calls.filter((c) => c.method === 'getDetails')).toHaveLength(1);
  });

  it('re-fetches details on the next status change after an unavailable result', async () => {
    // A transient null must not latch the account line off for the whole mount — the next status
    // transition has to retry, so a fetch that queued behind a long initial sync eventually paints.
    const controller = new FakeSyncController();
    controller.scriptDetails(null);
    controller.scriptDetails({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: null,
    });
    renderSection(controller);

    act(() => controller.setStatus('active'));
    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'getDetails')).toHaveLength(1)
    );
    expect(screen.queryByTestId('sync-account-label')).not.toBeInTheDocument();

    act(() => controller.setStatus('syncing'));
    expect(await screen.findByText('Signed in as kes@example.com')).toBeInTheDocument();
  });

  it('drops the shown identity on disable so a re-enable fetches fresh details', async () => {
    // Same mount, different account: the section must never keep showing the previous owner.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptDetails({ accountEmail: 'a@example.com', accountId: 'a', lastSyncedAt: null });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText('Signed in as a@example.com');

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));

    // Re-enable with account B's fetch still in flight. The assertion has to land here, not at
    // 'off': the whole subgroup is unrendered at 'off' (STATUS_PILL_LABEL has no entry), so the
    // label's absence there holds even if the old details were kept.
    controller.deferNextDetails();
    act(() => controller.setStatus('active'));
    expect(screen.getByTestId('sync-status-pill')).toBeInTheDocument();
    expect(screen.queryByText('Signed in as a@example.com')).not.toBeInTheDocument();

    await act(async () => {
      controller.resolveDetails({
        accountEmail: 'b@example.com',
        accountId: 'b',
        lastSyncedAt: null,
      });
    });
    expect(screen.getByText('Signed in as b@example.com')).toBeInTheDocument();
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

  it('keeps the Sync now refresh when a slow mount fetch resolves afterward', async () => {
    // The mount details fetch is still in flight when Sync now fires its own refresh; the newer
    // refresh must win, and the late mount fetch must be dropped rather than painting stale data.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextDetails(); // the mount fetch hangs
    controller.scriptDetails({
      accountEmail: 'fresh@example.com',
      accountId: 'user-1',
      lastSyncedAt: Date.now(),
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('Signed in as fresh@example.com')).toBeInTheDocument();

    // The stale mount fetch finally resolves — the generation guard must drop it. `await act(async)`
    // is required: a sync act() only queues the .then microtask, so the guard would never run and
    // this test would pass even with the guard deleted.
    await act(async () => {
      controller.resolveDetails({
        accountEmail: 'stale@example.com',
        accountId: 'user-1',
        lastSyncedAt: null,
      });
    });
    expect(screen.getByText('Signed in as fresh@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Signed in as stale@example.com')).not.toBeInTheDocument();
  });

  it('re-arms the details latch when getDetails rejects, so a later transition retries', async () => {
    // getDetails is contracted never to reject; a host that breaks the contract must not latch the
    // account line off for the rest of the mount.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const controller = new FakeSyncController();
    controller.failNext('getDetails');
    controller.scriptDetails({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: null,
    });
    renderSection(controller);

    act(() => controller.setStatus('active'));
    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(screen.queryByTestId('sync-account-label')).not.toBeInTheDocument();

    act(() => controller.setStatus('syncing'));
    expect(await screen.findByText('Signed in as kes@example.com')).toBeInTheDocument();
    warnSpy.mockRestore();
  });

  it('keeps the last known details when the Sync now refresh returns null', async () => {
    // A stale line beats a vanishing one — a transient refresh miss must not blank the account.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptDetails({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: null,
    });
    controller.scriptDetails(null); // the Sync now refresh misses
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText('Signed in as kes@example.com');

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'getDetails')).toHaveLength(2)
    );
    expect(screen.getByText('Signed in as kes@example.com')).toBeInTheDocument();
  });

  it('drops a Sync now refresh that lands after a disable, never repainting the old account', async () => {
    // handleDisable clears the shown identity; a refresh already in flight must not undo that in
    // the window before the controller's status flips (status stays 'active' here, so the pill —
    // and therefore the account line — would render if the stale refresh repainted).
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptDetails({ accountEmail: 'a@example.com', accountId: 'a', lastSyncedAt: null });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText('Signed in as a@example.com');

    controller.deferNextDetails(); // the Sync now refresh hangs
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'getDetails')).toHaveLength(2)
    );

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    expect(screen.queryByTestId('sync-account-label')).not.toBeInTheDocument();

    await act(async () => {
      controller.resolveDetails({
        accountEmail: 'a@example.com',
        accountId: 'a',
        lastSyncedAt: null,
      });
    });
    expect(screen.queryByText('Signed in as a@example.com')).not.toBeInTheDocument();
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

  it('keeps the account controls while a failed cycle is showing', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptDetails({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: null,
    });
    controller.scriptSyncNow({ kind: 'failed', reason: 'device', error: new Error('unreadable') });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-account-label');

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByTestId('sync-failure-badge')).toBeInTheDocument();
    // A wedged cycle must not borrow the 'error' status: that one is for a failed enrolment and
    // hides the very controls — account line, Sync now, Regenerate — that recover from this.
    expect(screen.getByTestId('sync-status-pill')).toHaveTextContent('Active');
    expect(screen.getByTestId('sync-account-label')).toHaveTextContent('Signed in as kes@example');
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Regenerate recovery code/ })).toBeInTheDocument();
  });

  it('falls back to the incomplete-sync copy for a failure reason this build has no copy for', async () => {
    // Version skew: an updated service worker can report a reason an already-open page predates.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptSyncNow({
      kind: 'failed',
      reason: 'quota' as SyncFailureReason,
      error: new Error('unknown to this bundle'),
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByTestId('sync-failure-badge')).toHaveTextContent(INCOMPLETE_MESSAGE);
    expect(toastError).toHaveBeenCalledWith(INCOMPLETE_MESSAGE);
  });

  it('logs an unrecognised failure reason once, where the outcome arrives', async () => {
    // The fallback copy is identical to a genuine no-key/resynced outcome's, so without this log
    // a skewed peer is indistinguishable from a normal incomplete cycle.
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    controller.scriptSyncNow({
      kind: 'failed',
      reason: 'quota' as SyncFailureReason,
      error: new Error('unknown to this bundle'),
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await screen.findByTestId('sync-failure-badge');

    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync reported an unrecognised failure reason: quota'
    );
    // Logging from failureMessage instead would repeat on every paint; a repaint proves it does not.
    errorSpy.mockClear();
    act(() => controller.setStatus('syncing'));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not report success for a cycle that did nothing', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptSyncNow({ kind: 'resynced' });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('toasts the reason, not Synced, when the cycle fails', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptSyncNow({ kind: 'failed', reason: 'server', error: new Error('503') });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Cloud Sync is having trouble. This device will keep retrying.'
      )
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('shows a failed background cycle on mount, with no click', async () => {
    // A failing pull wake never involves the panel; reading the last cycle on mount is the only
    // way it is already on screen when the user opens Settings to find out what is wrong.
    const controller = new FakeSyncController();
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    expect(
      await screen.findByText(
        "Can't reach Cloud Sync. Your data is safe on this device and will sync when you're back online."
      )
    ).toBeInTheDocument();
    expect(controller.calls.some((c) => c.method === 'syncNow')).toBe(false);
  });

  it('shows a failed initial sync after an enable, with no further click', async () => {
    // Enabling while offline lands at active with a failed cycle behind it; the mount read already
    // ran, and the enable path fires no status the panel re-reads on, so only this re-read finds it.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });

    await enterEnableStep(user, 'acct-1');
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-failure-badge')).toBeInTheDocument();
    expect(controller.calls.some((c) => c.method === 'syncNow')).toBe(false);
  });

  it('says it could not check the last sync when the read comes back unreadable', async () => {
    // On a fresh mount there is no badge to protect, so this used to look exactly like health.
    const controller = new FakeSyncController();
    controller.scriptLastCycleUnavailable();
    renderSection(controller);

    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-cycle-unknown')).toBeInTheDocument();
    expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument();
  });

  it('still reports a Sync now result on a host that emits status from inside the call', async () => {
    // macOS emits 'syncing' synchronously inside syncNow. That re-runs the read effect, and gating
    // the click on the read counter let its own emission swallow the outcome and every toast.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.emitsSyncingDuringSyncNow = true;
    // An unavailable read re-arms the effect, which is what lets the emission bump the counter.
    controller.scriptLastCycleUnavailable();
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-cycle-unknown');

    // Deferred so the emission's effect flushes while the cycle is still in flight, as a real
    // network cycle does — resolving inside one act would hide the race.
    controller.deferNextSyncNow();
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await act(async () => {
      controller.resolveSyncNow({ kind: 'synced' });
    });

    expect(toastSuccess).toHaveBeenCalledWith('Synced');
  });

  it('drops the unknown line once a read can answer again', async () => {
    // Otherwise the line latches and a recovered device keeps saying it could not be checked.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptLastCycleUnavailable();
    controller.scriptSyncNow({ kind: 'synced' });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-cycle-unknown');

    controller.scriptLastCycle(null);
    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Synced'));
    expect(screen.queryByTestId('sync-cycle-unknown')).not.toBeInTheDocument();
  });

  it('drops the unknown line when a retried read answers, not only when a click does', async () => {
    // handleSyncNow paints directly, so without this only the click's clear is covered.
    const controller = new FakeSyncController();
    controller.scriptLastCycleUnavailable();
    renderSection(controller);
    // An unavailable read re-arms the once-per-mount fetch, so each transition retries.
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-cycle-unknown');

    controller.scriptLastCycle(null);
    act(() => controller.setStatus('syncing'));
    act(() => controller.setStatus('active'));

    await waitFor(() => expect(screen.queryByTestId('sync-cycle-unknown')).not.toBeInTheDocument());
  });

  it('stays quiet about an unreadable read while sync is still connecting', async () => {
    // Mid-enrolment nothing has synced yet, so the line reads as an enrolment problem.
    const controller = new FakeSyncController();
    controller.scriptLastCycleUnavailable();
    renderSection(controller);

    act(() => controller.setStatus('connecting'));

    expect(await screen.findByTestId('sync-status-pill')).toHaveTextContent('Connecting…');
    expect(screen.queryByTestId('sync-cycle-unknown')).not.toBeInTheDocument();
  });

  it('keeps a failure badge rather than downgrading it to the unknown line', async () => {
    // The badge is the stronger claim; an unreadable read says nothing about it.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptLastCycle({
      kind: 'failed',
      reason: 'device',
      error: new Error('unreadable'),
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-failure-badge');

    // A rejected Sync now routes through refreshLastCycle — the path that reads a second time.
    controller.scriptLastCycleUnavailable();
    controller.deferNextSyncNow();
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await act(async () => {
      controller.rejectSyncNow(new Error('Sync control message timed out'));
    });

    expect(screen.getByTestId('sync-failure-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('sync-cycle-unknown')).not.toBeInTheDocument();
  });

  it('asks for the recovery code, not a re-auth, when this device has no key', async () => {
    const controller = new FakeSyncController();
    renderSection(controller);

    act(() => controller.setStatus('needs_enroll'));

    expect(await screen.findByTestId('sync-reconnect-prompt')).toHaveTextContent(
      /can't read its encryption key/i
    );
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    // Both would fail without a key, so offering either offers a broken button.
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Regenerate recovery code' })
    ).not.toBeInTheDocument();
  });

  it('still says the sign-in expired when that is what actually happened', async () => {
    const controller = new FakeSyncController();
    renderSection(controller);

    act(() => controller.setStatus('needs_reauth'));

    expect(await screen.findByTestId('sync-reconnect-prompt')).toHaveTextContent(
      /sign-in expired/i
    );
  });

  it('clears the failure once a later cycle succeeds', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    controller.scriptSyncNow({ kind: 'synced' });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText(/can't reach cloud sync/i);

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Synced'));
    expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument();
  });

  it("drops the failure on disable so a re-enable cannot show the old account's", async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptLastCycle({
      kind: 'failed',
      reason: 'device',
      error: new Error('unreadable'),
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByText(DEVICE_FAILURE_MESSAGE);

    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));
    act(() => controller.setStatus('active'));

    expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument();
  });

  it("drops a Sync now outcome that lands after a disable, never wearing the old account's failure", async () => {
    // Clicking Sync now offline can hang for the bridge's full timeout; disabling meanwhile must
    // win, or the re-enabled (possibly different) account inherits the dead one's badge.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));
    controller.deferNextSyncNow();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));
    act(() => controller.setStatus('active'));

    await act(async () => {
      controller.resolveSyncNow({
        kind: 'failed',
        reason: 'device',
        error: new Error('unreadable'),
      });
    });

    expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument();
    // The badge is the quiet surface; a toast promising it "will keep retrying" is the loud one,
    // and sync is off — the guard has to cover both.
    expect(toastError).not.toHaveBeenCalled();
  });

  it('does not toast Synced for a click that lands after the user disabled sync', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));
    controller.deferNextSyncNow();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));

    await act(async () => {
      controller.resolveSyncNow({ kind: 'synced' });
    });

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('re-reads the last cycle when Sync now rejects, so the badge is not blanked for the mount', async () => {
    // The mount read is still in flight (asleep worker, 30s bridge timeout) when the click bumps
    // the generation past it; the rejection must take a fresh read or nothing ever repaints.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextLastCycle();
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    controller.failNext('syncNow');
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByTestId('sync-failure-badge')).toHaveTextContent(/can't reach cloud/i);
  });

  it('keeps the failure badge when the read recovering a rejected Sync now is unavailable', async () => {
    // The click and the recovery read fail for the SAME reason — an asleep or dead worker. The
    // read reports "I could not tell", which must never be mistaken for "no cycle has run".
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-failure-badge');

    controller.failNext('syncNow');
    controller.scriptLastCycleUnavailable();
    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('sync-failure-badge')).toHaveTextContent(/can't reach cloud sync/i);
  });

  it('keeps the failure badge when the read recovering a rejected Sync now itself rejects', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-failure-badge');

    controller.failNext('syncNow');
    controller.failNext('getLastCycle');
    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    // Error level, not warn: the shipped logLevel is 'error', so a warn prints for nobody.
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cloud sync last cycle unavailable'),
        expect.any(Error)
      )
    );
    expect(screen.getByTestId('sync-failure-badge')).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('clears the failure badge when the recovery read reports the engine has no cycle', async () => {
    // The counterpart: a read that DID answer, with no cycle behind it, still repaints. The guard
    // is about an unreadable engine, not about never clearing.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    renderSection(controller);
    act(() => controller.setStatus('active'));
    await screen.findByTestId('sync-failure-badge');

    controller.failNext('syncNow');
    controller.scriptLastCycle(null);
    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument());
  });

  it('leaves the badge off, never unhandled, when the mount read rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    controller.failNext('getLastCycle');
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cloud sync last cycle unavailable'),
        expect.any(Error)
      )
    );
    expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('retries an unavailable mount read on the next status transition', async () => {
    // The mount read hits an asleep worker. Without a re-arm the effect keys on a stable prop and
    // never runs again, so a wedged device shows Active with no badge for the whole mount.
    const controller = new FakeSyncController();
    controller.scriptLastCycleUnavailable();
    renderSection(controller);
    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'getLastCycle')).toHaveLength(1)
    );

    controller.scriptLastCycle({
      kind: 'failed',
      reason: 'device',
      error: new Error('unreadable'),
    });
    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-failure-badge')).toHaveTextContent(
      DEVICE_FAILURE_MESSAGE
    );
  });

  it('does not toast a sync-now rejection for a click that lands after the user disabled sync', async () => {
    // A click can hang for the bridge's full timeout; by the time it rejects, sync is off and the
    // Sync now button is unrendered — "please try again" would name an action the panel lacks.
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));
    controller.deferNextSyncNow();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));

    await act(async () => {
      controller.rejectSyncNow(new Error('Sync control message timed out'));
    });

    expect(toastError).not.toHaveBeenCalled();
    // The recovery read is superseded too — only the diagnostic log survives the guard.
    expect(controller.calls.filter((c) => c.method === 'getLastCycle')).toHaveLength(1);
    // The cause is in the message text, not only the Error arg: the bridge builds the worker's
    // reason into `message`, which is non-enumerable and vanishes on a serialising surface.
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync sync-now failed: Sync control message timed out',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('does not warn about an incomplete cycle for a click that lands after the user disabled sync', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));
    controller.deferNextSyncNow();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));

    await act(async () => {
      controller.resolveSyncNow({ kind: 'no-key' });
    });

    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('logs an unrecognised failure reason even when the click that carried it was superseded', async () => {
    // Supersession is a reason not to paint another account's outcome; the unknown reason is a
    // build/skew defect, and this click is the only place it was ever visible.
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));
    controller.deferNextSyncNow();

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await user.click(cloudSyncSwitch());
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    act(() => controller.setStatus('off'));

    await act(async () => {
      controller.resolveSyncNow({
        kind: 'failed',
        reason: 'quota' as SyncFailureReason,
        error: new Error('unknown to this bundle'),
      });
    });

    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync reported an unrecognised failure reason: quota'
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // Back to a status that renders a pill, or the badge is unrenderable and asserting its absence
    // proves nothing about the supersession guard.
    act(() => controller.setStatus('active'));
    expect(screen.queryByTestId('sync-failure-badge')).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs an unrecognised failure reason read on mount, where no click is involved', async () => {
    // The scenario the log exists for: a background wake's outcome, reported by a skewed worker,
    // arrives through the mount read — the one call site the click-driven tests never reach.
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new FakeSyncController();
    controller.scriptLastCycle({
      kind: 'failed',
      reason: 'quota' as SyncFailureReason,
      error: new Error('unknown to this bundle'),
    });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-failure-badge')).toHaveTextContent(INCOMPLETE_MESSAGE);
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync reported an unrecognised failure reason: quota'
    );
    expect(controller.calls.some((c) => c.method === 'syncNow')).toBe(false);
    errorSpy.mockRestore();
  });

  it('shows a failed initial sync after a device-#2 enroll, with no further click', async () => {
    // Enrolling device #2 on a flaky connection is the likeliest failing initial cycle; like the
    // enable path it lands on Active with nothing else to read the outcome off.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: false, reason: 'needs-code' });
    renderSection(controller);

    await enterEnableStep(user, 'acct-2');
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    await screen.findByText('Enter recovery code');
    controller.scriptLastCycle({ kind: 'failed', reason: 'network', error: new Error('offline') });
    await user.type(screen.getByLabelText(/recovery code/i), CODE);
    await user.click(screen.getByRole('button', { name: 'Enroll' }));
    act(() => controller.setStatus('active'));

    expect(await screen.findByTestId('sync-failure-badge')).toBeInTheDocument();
    expect(controller.calls.some((c) => c.method === 'syncNow')).toBe(false);
  });

  it('drops a stale mount read that lands after a Sync now failure', async () => {
    // The mount read and the click race; the click is newer, so its outcome must win even when
    // the mount read resolves last. Without the generation guard the stale null wipes the badge.
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.deferNextLastCycle();
    controller.scriptSyncNow({ kind: 'failed', reason: 'device', error: new Error('unreadable') });
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await screen.findByTestId('sync-failure-badge');

    // `await act(async)` so the resolution's microtask actually runs — a sync act() would leave
    // the handler unrun and this would pass even with the generation guard deleted.
    await act(async () => {
      controller.resolveLastCycle(null);
    });
    expect(screen.getByTestId('sync-failure-badge')).toBeInTheDocument();
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

  it('retries reconnect on failedAction even with a typed account id (never enable/syncNow)', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'error' });
    renderSection(controller);

    // Type an account id, THEN drive a reconnect flow. The retry must route on failedAction, not
    // on "the account id is empty" — otherwise this non-empty id would wrongly retry enable().
    await enterEnableStep(user, 'typed-acct');
    act(() => controller.setStatus('needs_reauth'));
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    act(() => controller.setStatus('error'));

    controller.scriptReconnect({ ok: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(controller.calls.filter((c) => c.method === 'reconnect')).toHaveLength(2)
    );
    expect(controller.calls.some((c) => c.method === 'enable')).toBe(false);
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
