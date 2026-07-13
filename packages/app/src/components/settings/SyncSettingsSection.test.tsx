import { defaultSettings } from '@cuewise/test-utils';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSyncController } from '../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext } from '../../sync/sync-controller';
import { SyncSettingsSectionComponent } from './SyncSettingsSection';
import type { SettingsSectionProps } from './settings-types';

const toastError = vi.fn();
vi.mock('../../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError }),
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

  it('calls controller.syncNow() when Sync now is clicked', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(controller.calls).toContainEqual({ method: 'syncNow', args: [] }));
  });

  it('calls controller.syncNow() when Try again is clicked in the error state', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('error'));

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(controller.calls).toContainEqual({ method: 'syncNow', args: [] }));
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
});
