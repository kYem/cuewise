import { configurePlatform, logger, type NotificationPermission } from '@cuewise/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestNotificationRow } from './TestNotificationRow';

const notify = vi.fn(() => Promise.resolve());
const permission = vi.fn<() => Promise<NotificationPermission>>(() => Promise.resolve('granted'));

beforeEach(() => {
  vi.clearAllMocks();
  permission.mockResolvedValue('granted');
  configurePlatform({ notifier: { notify, clear: async () => {}, permission } });
});

function renderRow(enabled = true, filter = '') {
  return render(<TestNotificationRow enabled={enabled} filter={filter} />);
}

describe('TestNotificationRow', () => {
  it('is disabled with a hint while the Notifications switch is off', () => {
    renderRow(false);

    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
    expect(screen.getByText('Turn Notifications on first.')).toBeInTheDocument();
  });

  it('sends a notification shaped exactly like a reminder', async () => {
    renderRow();

    await userEvent.click(screen.getByRole('button', { name: 'Send test' }));

    expect(notify).toHaveBeenCalledWith({
      id: 'reminder-test',
      title: '🔔 Reminder',
      body: expect.stringContaining('test'),
      actions: ['Done', 'Snooze 5 min'],
      requireInteraction: true,
    });
    expect(await screen.findByText(/^Sent\./)).toBeInTheDocument();
  });

  it('does not send when notifications are blocked, and says where to fix it', async () => {
    permission.mockResolvedValue('denied');
    renderRow();

    await userEvent.click(screen.getByRole('button', { name: 'Send test' }));

    expect(notify).not.toHaveBeenCalled();
    expect(await screen.findByText(/blocked for Cuewise/)).toBeInTheDocument();
  });

  it('reports a failed send instead of throwing', async () => {
    notify.mockRejectedValueOnce(new Error('no notifications API'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});
    renderRow();

    await userEvent.click(screen.getByRole('button', { name: 'Send test' }));

    expect(await screen.findByText(/Couldn't send/)).toBeInTheDocument();
    expect(errorLog).toHaveBeenCalledWith(
      'Failed to send the test notification',
      expect.any(Error)
    );
  });

  it('hides itself, hint included, when the search filter does not match', () => {
    renderRow(false, 'wallpaper');

    expect(screen.queryByRole('button', { name: 'Send test' })).not.toBeInTheDocument();
    expect(screen.queryByText('Turn Notifications on first.')).not.toBeInTheDocument();
  });
});
