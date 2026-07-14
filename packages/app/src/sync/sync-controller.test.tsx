import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeSyncController } from './__fixtures__/fake-sync-controller';
import { SyncControllerContext, useSyncController } from './sync-controller';

function Probe() {
  const controller = useSyncController();
  return <div data-testid="probe">{controller === null ? 'no-controller' : 'has-controller'}</div>;
}

describe('useSyncController', () => {
  it('returns null when rendered outside a SyncControllerContext provider', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('no-controller');
  });

  it('returns the controller supplied by the provider', () => {
    const controller = new FakeSyncController();
    const { getByTestId } = render(
      <SyncControllerContext.Provider value={controller}>
        <Probe />
      </SyncControllerContext.Provider>
    );
    expect(getByTestId('probe').textContent).toBe('has-controller');
  });
});

describe('FakeSyncController', () => {
  it('starts off and reports the current status via getStatus', () => {
    const controller = new FakeSyncController();
    expect(controller.getStatus()).toBe('off');
  });

  it('notifies a subscriber with the new status when setStatus is called', () => {
    const controller = new FakeSyncController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setStatus('syncing');

    expect(listener).toHaveBeenCalledWith('syncing');
    expect(controller.getStatus()).toBe('syncing');
  });

  it('stops notifying a subscriber once its unsubscribe function is called', () => {
    const controller = new FakeSyncController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    controller.setStatus('error');

    expect(listener).not.toHaveBeenCalled();
  });

  it('records enable() calls and resolves with the scripted result', async () => {
    const controller = new FakeSyncController();
    controller.scriptEnable({ ok: true, recoveryCode: 'ABC-123' });

    const result = await controller.enable('acct-1', 'MacBook', 'recovery-code');

    expect(result).toEqual({ ok: true, recoveryCode: 'ABC-123' });
    expect(controller.calls).toEqual([
      { method: 'enable', args: ['acct-1', 'MacBook', 'recovery-code'] },
    ]);
  });

  it('records reconnect() calls and resolves with the scripted result', async () => {
    const controller = new FakeSyncController();
    controller.scriptReconnect({ ok: false, reason: 'auth' });

    const result = await controller.reconnect();

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(controller.calls).toEqual([{ method: 'reconnect', args: [undefined] }]);
  });

  it('records the recovery code passed to reconnect()', async () => {
    const controller = new FakeSyncController();

    await controller.reconnect('recovery-code');

    expect(controller.calls).toEqual([{ method: 'reconnect', args: ['recovery-code'] }]);
  });

  it('falls back to an ok result when no script was queued', async () => {
    const controller = new FakeSyncController();

    const result = await controller.enable('acct-1', 'MacBook');

    expect(result).toEqual({ ok: true });
  });

  it('records enableWithGoogle() calls and resolves with the scripted result', async () => {
    const controller = new FakeSyncController();
    controller.scriptEnableWithGoogle({ ok: true, recoveryCode: 'ABC-123' });

    const result = await controller.enableWithGoogle('MacBook', 'recovery-code');

    expect(result).toEqual({ ok: true, recoveryCode: 'ABC-123' });
    expect(controller.calls).toEqual([
      { method: 'enableWithGoogle', args: ['MacBook', 'recovery-code'] },
    ]);
  });

  it('falls back to an ok result for enableWithGoogle when no script was queued', async () => {
    const controller = new FakeSyncController();

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({ ok: true });
  });

  it('records disable, regenerateRecoveryCode, and syncNow calls', async () => {
    const controller = new FakeSyncController();

    await controller.disable();
    const code = await controller.regenerateRecoveryCode();
    await controller.syncNow();

    expect(code).toBe('FAKE-RECOVERY-CODE');
    expect(controller.calls).toEqual([
      { method: 'disable', args: [] },
      { method: 'regenerateRecoveryCode', args: [] },
      { method: 'syncNow', args: [] },
    ]);
  });
});
