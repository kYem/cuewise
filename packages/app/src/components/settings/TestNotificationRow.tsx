import { getNotifier, logger } from '@cuewise/shared';
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
const KEYWORDS = 'test notification preview check reminder alert';
const TEST_BODY = 'This is a test reminder. If you can see it, reminders will reach you.';

type Outcome = 'idle' | 'sending' | 'sent' | 'blocked' | 'failed';

// The extension cannot see an OS-level mute of the browser itself, so "sent" still hedges.
const OUTCOME_NOTES: Partial<Record<Outcome, string>> = {
  sent: "Sent. Nothing appeared? Check your system's notification settings — the browser or app itself may be muted.",
  blocked: 'Notifications are blocked for Cuewise — allow them in your browser or system settings.',
  failed: "Couldn't send the notification. Check your browser's notification settings.",
};
const SWITCH_OFF_NOTE = 'Turn Notifications on first.';

interface TestNotificationRowProps {
  /** The Settings → Notifications switch; a test while it is off would prove nothing. */
  enabled: boolean;
  filter: string;
}

export const TestNotificationRow: React.FC<TestNotificationRowProps> = ({ enabled, filter }) => {
  const [outcome, setOutcome] = useState<Outcome>('idle');

  if (!settingsMatch(filter, LABEL, HELP, KEYWORDS)) {
    return null;
  }

  const send = async () => {
    setOutcome('sending');
    try {
      const notifier = getNotifier();
      if ((await notifier.permission()) === 'denied') {
        setOutcome('blocked');
        return;
      }
      await notifier.notify(reminderNotification(REMINDER_TEST_NOTIFICATION_ID, TEST_BODY));
      setOutcome('sent');
    } catch (error) {
      logger.error('Failed to send the test notification', error);
      setOutcome('failed');
    }
  };

  const note = enabled ? OUTCOME_NOTES[outcome] : SWITCH_OFF_NOTE;

  return (
    <>
      <SettingRow label={LABEL} help={HELP} keywords={KEYWORDS} filter={filter}>
        <button
          type="button"
          onClick={send}
          disabled={!enabled || outcome === 'sending'}
          className="flex flex-none items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BellRing className="h-3.5 w-3.5" />
          {outcome === 'sending' ? 'Sending…' : 'Send test'}
        </button>
      </SettingRow>
      {note && <p className="-mt-1 mb-2 max-w-[420px] text-xs text-tertiary">{note}</p>}
    </>
  );
};
