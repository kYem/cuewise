import { defaultSettings } from '@cuewise/test-utils';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { FakeSyncController } from '../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext } from '../../sync/sync-controller';
import { setReducedMotion } from '../__fixtures__/motion.fixtures';
import { SyncSettingsSectionComponent } from './SyncSettingsSection';
import type { SettingsSectionProps } from './settings-types';

// Golden CW1 code from @cuewise/crypto's fixtures — same one RecoveryCodeModal.test.tsx uses,
// so the dash-separated groups are real and group 3 matches the modal's confirm gate.
const CODE = 'CW1-MWWJH-3K3QQ-R4RNB-JW1PV-8TRQT-PC14A-R5G5V';
const CODE_GROUP_3 = '3K3QQ';
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

function renderSection(controller: FakeSyncController) {
  return render(
    <SyncControllerContext.Provider value={controller}>
      <SyncSettingsSectionComponent {...sectionProps()} />
    </SyncControllerContext.Provider>
  );
}

const cloudSyncSwitch = () => screen.getByRole('checkbox', { name: 'Cloud Sync' });

// Satisfies RecoveryCodeModal's segment-confirm gate and clicks Done.
const confirmAndSaveRecoveryCode = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText('Save your recovery code');
  await user.type(screen.getByLabelText(/group 3/i), CODE_GROUP_3);
  await user.click(screen.getByRole('button', { name: 'Done' }));
};

// jsdom has no IntersectionObserver; NewTabPage's sticky-header effect only
// needs the constructor to exist, never fires it in these tests.
class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('enable-sync UI end-to-end flow', () => {
  it('brand-new enable: off -> RecoveryCodeModal (segment gate) -> active affordances', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true, recoveryCode: CODE });
    renderSection(controller);

    await user.click(cloudSyncSwitch());
    await user.type(screen.getByLabelText('Account ID'), 'acct-1');
    const deviceNameInput = screen.getByLabelText('Device name');
    await user.clear(deviceNameInput);
    await user.type(deviceNameInput, 'MyMac');
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    for (const group of CODE.split('-')) {
      expect(await screen.findByText(group)).toBeInTheDocument();
    }

    await confirmAndSaveRecoveryCode(user);

    expect(screen.queryByText('Save your recovery code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unsaved-code-banner')).not.toBeInTheDocument();

    act(() => controller.setStatus('active'));

    expect(screen.getByTestId('sync-status-pill')).toHaveTextContent('Active');
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate recovery code' })).toBeInTheDocument();
  });

  it('needs_reauth -> Reconnect -> active, with no recovery code sent', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: true });
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    act(() => controller.setStatus('active'));

    expect(screen.getByTestId('sync-status-pill')).toHaveTextContent('Active');
    expect(screen.queryByText('Save your recovery code')).not.toBeInTheDocument();
    expect(controller.calls).toContainEqual({ method: 'reconnect', args: [] });
  });

  it('reconnect returning needs-code opens EnrollCodeModal', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'needs-code' });
    renderSection(controller);
    act(() => controller.setStatus('needs_reauth'));

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(await screen.findByText('Enter recovery code')).toBeInTheDocument();
  });

  it('disabling from an active state shows the confirm dialog with the recovery-code warning', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    renderSection(controller);
    act(() => controller.setStatus('active'));

    await user.click(cloudSyncSwitch());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(DISABLE_MESSAGE)).toBeInTheDocument();
  });
});

describe('dev-flag gating (integration re-assert)', () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.IntersectionObserver =
      StubIntersectionObserver as unknown as typeof IntersectionObserver;
    // The shared chrome-storage mock doesn't stub onChanged; pomodoro-store's
    // cross-tab sync listener needs it to mount without throwing.
    (chrome.storage as unknown as Record<string, unknown>).onChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    window.location.hash = '#settings';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('shows no Cloud Sync section when App is rendered without a syncController', async () => {
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: 'Settings sections' });

    expect(within(nav).queryByRole('button', { name: 'Cloud Sync' })).not.toBeInTheDocument();
  });
});
