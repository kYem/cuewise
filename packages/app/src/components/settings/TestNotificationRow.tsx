import { getNotifier, logger, NotificationBlockedError } from '@cuewise/shared';
import { BellRing } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  REMINDER_TEST_NOTIFICATION_ID,
  reminderNotification,
} from '../../services/reminder-notifications';
import { SettingRow } from './SettingControls';
import { settingsMatch } from './settings-match';

const LABEL = 'Test notification';
const HELP = 'Send one now to check it reaches you';
const KEYWORDS = 'test notifications send test preview check reminder alert';
const TEST_BODY = 'This is a test reminder. If you can see it, reminders will reach you.';

type Result = 'sent' | 'blocked' | 'failed';

// No host can see an OS-level mute of the browser or app itself, so "sent" still hedges.
const RESULT_NOTES: Record<Result, string> = {
  sent: "Sent. Nothing appeared? Check your system's notification settings — the browser or app itself may be muted.",
  blocked: 'Notifications are blocked for Cuewise — allow them in your browser or system settings.',
  failed:
    "Couldn't send the notification. Reload this page and try again; if it keeps failing, check that notifications are allowed for Cuewise.",
};

export const TestNotificationRow: React.FC<{ filter: string }> = ({ filter }) => {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  if (!settingsMatch(filter, LABEL, HELP, KEYWORDS)) {
    return null;
  }

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const notifier = getNotifier();
      if ((await notifier.permission()) === 'denied') {
        setResult('blocked');
        return;
      }
      await notifier.notify(reminderNotification(REMINDER_TEST_NOTIFICATION_ID, TEST_BODY));
      setResult('sent');
    } catch (error) {
      if (error instanceof NotificationBlockedError) {
        setResult('blocked');
        return;
      }
      logger.error('Failed to send the test notification', error);
      setResult('failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SettingRow label={LABEL} help={HELP} keywords={KEYWORDS} filter={filter}>
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="flex flex-none items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BellRing className="h-3.5 w-3.5" />
          {sending ? 'Sending…' : 'Send test'}
        </button>
      </SettingRow>
      {result && (
        <p className="-mt-1 mb-2 max-w-[420px] text-xs text-tertiary">{RESULT_NOTES[result]}</p>
      )}
    </>
  );
};
