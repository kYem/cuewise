import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Compass } from 'lucide-react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { setReducedMotion } from './components/__fixtures__/motion.fixtures';
import type { SettingsSection } from './components/settings/SettingsSections';
import { FakeSyncController } from './sync/__fixtures__/fake-sync-controller';

// Deep-link the same way the macOS tray does: NewTabPage's own effect reads
// this hash on mount and opens SettingsModal, bypassing the nav-menu click.
function openViaHash() {
  window.location.hash = '#settings';
}

const EXTRA_SECTION: SettingsSection = {
  id: 'posture',
  label: 'Posture',
  icon: Compass,
  component: () => <div>Posture settings</div>,
  terms: 'posture reminders stretch',
};

const settingsSectionsNav = () => screen.findByRole('navigation', { name: 'Settings sections' });
const chromeSyncSwitch = () => screen.getByRole('checkbox', { name: 'Chrome sync' });

// jsdom has no IntersectionObserver; NewTabPage's sticky-header effect only
// needs the constructor to exist, never fires it in these tests.
class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('App sync wiring', () => {
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
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('shows no Cloud Sync section in settings when no syncController is provided', async () => {
    openViaHash();
    render(<App />);

    const nav = await settingsSectionsNav();
    expect(within(nav).queryByRole('button', { name: 'Cloud Sync' })).not.toBeInTheDocument();
  });

  it('shows the Cloud Sync section in settings when a syncController is provided', async () => {
    openViaHash();
    render(<App syncController={new FakeSyncController()} />);

    const nav = await settingsSectionsNav();
    expect(within(nav).getByRole('button', { name: 'Cloud Sync' })).toBeInTheDocument();
  });

  it('keeps exactly the host-provided extraSections and no Cloud Sync when there is no syncController', async () => {
    openViaHash();
    render(<App extraSections={[EXTRA_SECTION]} />);

    const nav = await settingsSectionsNav();
    expect(within(nav).getByRole('button', { name: 'Posture' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Cloud Sync' })).not.toBeInTheDocument();
  });

  it('shows both the Cloud Sync section and host extraSections when a syncController is provided', async () => {
    openViaHash();
    render(<App syncController={new FakeSyncController()} extraSections={[EXTRA_SECTION]} />);

    const nav = await settingsSectionsNav();
    expect(within(nav).getByRole('button', { name: 'Cloud Sync' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Posture' })).toBeInTheDocument();
  });

  it('leaves the legacy Chrome sync toggle enabled when there is no syncController', async () => {
    const user = userEvent.setup();
    openViaHash();
    render(<App />);

    const nav = await settingsSectionsNav();
    await user.click(within(nav).getByRole('button', { name: 'Advanced' }));

    expect(chromeSyncSwitch()).toBeEnabled();
    expect(screen.queryByText('Managed by Cloud Sync')).not.toBeInTheDocument();
  });

  it('disables the legacy Chrome sync toggle and shows a note once Cloud Sync is active', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    openViaHash();
    render(<App syncController={controller} />);

    const nav = await settingsSectionsNav();
    await user.click(within(nav).getByRole('button', { name: 'Advanced' }));

    expect(chromeSyncSwitch()).toBeEnabled();

    act(() => controller.setStatus('active'));

    expect(chromeSyncSwitch()).toBeDisabled();
    expect(screen.getByText('Managed by Cloud Sync')).toBeInTheDocument();
  });

  // error/needs_reauth still own local storage (enrolled), so the legacy toggle must stay gated.
  it('disables the legacy Chrome sync toggle when Cloud Sync is in needs_reauth', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    openViaHash();
    render(<App syncController={controller} />);

    const nav = await settingsSectionsNav();
    await user.click(within(nav).getByRole('button', { name: 'Advanced' }));

    act(() => controller.setStatus('needs_reauth'));

    expect(chromeSyncSwitch()).toBeDisabled();
    expect(screen.getByText('Managed by Cloud Sync')).toBeInTheDocument();
  });

  it('disables the legacy Chrome sync toggle when Cloud Sync is in error', async () => {
    const user = userEvent.setup();
    const controller = new FakeSyncController();
    openViaHash();
    render(<App syncController={controller} />);

    const nav = await settingsSectionsNav();
    await user.click(within(nav).getByRole('button', { name: 'Advanced' }));

    act(() => controller.setStatus('error'));

    expect(chromeSyncSwitch()).toBeDisabled();
    expect(screen.getByText('Managed by Cloud Sync')).toBeInTheDocument();
  });
});
