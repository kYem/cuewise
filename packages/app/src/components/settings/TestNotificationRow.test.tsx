import { configurePlatform, logger } from '@cuewise/shared';
import { fakeNotifier } from '@cuewise/test-utils/mocks';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestNotificationRow } from './TestNotificationRow';

const notifier = fakeNotifier();

beforeEach(() => {
  vi.clearAllMocks();
  notifier.permission.mockResolvedValue('granted');
  configurePlatform({ notifier });
});

function renderRow(enabled = true, filter = '') {
  return render(<TestNotificationRow enabled={enabled} filter={filter} />);
}

async function clickSend(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Send test' }));
}

describe('TestNotificationRow', () => {
  it('is disabled with a hint while the Notifications switch is off', () => {
    renderRow(false);

    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
    expect(screen.getByText('Turn Notifications on first.')).toBeInTheDocument();
  });

  it('sends a notification shaped exactly like a reminder', async () => {
    renderRow();

    await clickSend();

    expect(notifier.notify).toHaveBeenCalledWith({
      id: 'reminder-test',
      title: '🔔 Reminder',
      body: expect.stringContaining('test'),
      actions: ['Done', 'Snooze 5 min'],
      requireInteraction: true,
    });
    expect(await screen.findByText(/^Sent\./)).toBeInTheDocument();
  });

  // 'unknown' is not a refusal: whether notify can still prompt is the adapter's call.
  it('sends when the permission is unknown', async () => {
    notifier.permission.mockResolvedValue('unknown');
    renderRow();

    await clickSend();

    expect(notifier.notify).toHaveBeenCalled();
    expect(await screen.findByText(/^Sent\./)).toBeInTheDocument();
  });

  it('does not send when notifications are blocked, and says where to fix it', async () => {
    notifier.permission.mockResolvedValue('denied');
    renderRow();

    await clickSend();

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(await screen.findByText(/blocked for Cuewise/)).toBeInTheDocument();
  });

  it('reports a failed send instead of throwing', async () => {
    notifier.notify.mockRejectedValueOnce(new Error('no notifications API'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});
    renderRow();

    await clickSend();

    expect(await screen.findByText(/Couldn't send/)).toBeInTheDocument();
    expect(errorLog).toHaveBeenCalledWith(
      'Failed to send the test notification',
      expect.any(Error)
    );
  });

  // On Tauri, notify awaits a native prompt; a second click meanwhile would prompt twice.
  it('disables the button while a send is in flight', async () => {
    notifier.notify.mockReturnValueOnce(new Promise(() => {}));
    renderRow();

    await clickSend();

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('stays in flight across a switch toggle', async () => {
    notifier.notify.mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = renderRow();
    await clickSend();

    rerender(<TestNotificationRow enabled={false} filter="" />);
    rerender(<TestNotificationRow enabled={true} filter="" />);

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('drops the result of a send that finished while the switch was off', async () => {
    let finish = (): void => {};
    notifier.notify.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const { rerender } = renderRow();
    await clickSend();

    rerender(<TestNotificationRow enabled={false} filter="" />);
    await act(async () => {
      finish();
    });
    rerender(<TestNotificationRow enabled={true} filter="" />);

    expect(screen.queryByText(/^Sent\./)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send test' })).toBeEnabled();
  });

  it('forgets the last outcome when the switch is turned off', async () => {
    const { rerender } = renderRow();
    await clickSend();
    await screen.findByText(/^Sent\./);

    rerender(<TestNotificationRow enabled={false} filter="" />);
    rerender(<TestNotificationRow enabled={true} filter="" />);

    expect(screen.queryByText(/^Sent\./)).not.toBeInTheDocument();
  });

  it('hides itself, hint included, when the search filter does not match', () => {
    renderRow(false, 'wallpaper');

    expect(screen.queryByRole('button', { name: 'Send test' })).not.toBeInTheDocument();
    expect(screen.queryByText('Turn Notifications on first.')).not.toBeInTheDocument();
  });
});
