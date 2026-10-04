import { formatReminderCadence, logger, type Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { format, parseISO } from 'date-fns';
import { BellRing, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTabFocused } from '../../hooks/useTabFocused';
import {
  REMINDER_DONE_BUTTON,
  REMINDER_SNOOZE_BUTTON,
  respondToReminder,
} from '../../services/reminder-notifications';
import { type ReminderPrompt, removeReminderPrompt } from '../../services/reminder-prompts';
import { useReminderPromptStore } from '../../stores/reminder-prompt-store';
import { useReminderStore } from '../../stores/reminder-store';
import { useSettingsStore } from '../../stores/settings-store';
import { ReminderSnoozeRow } from './atoms';

/** The oldest prompt whose reminder still waits on an answer, so each one gets its turn. */
function promptToShow(
  prompts: ReminderPrompt[],
  reminders: Reminder[]
): { prompt: ReminderPrompt; reminder: Reminder } | null {
  for (const prompt of prompts) {
    const reminder = reminders.find((r) => r.id === prompt.reminderId);
    if (reminder !== undefined && !reminder.completed) {
      return { prompt, reminder };
    }
  }
  return null;
}

interface ReminderPromptCardProps {
  /** Tailwind `right-*` class matching the bell's, which moves when the theme switcher shows. */
  rightPosition?: string;
  /** The open bell panel already shows the reminder, so the card steps aside meanwhile. */
  hidden?: boolean;
}

/**
 * The fired reminder, answered in place. Only the focused tab shows it, so several open tabs never
 * stack a card each; answering anywhere clears the prompt every tab is watching.
 */
export function ReminderPromptCard({
  rightPosition = 'right-4',
  hidden = false,
}: ReminderPromptCardProps) {
  const prompts = useReminderPromptStore((state) => state.prompts);
  const initialize = useReminderPromptStore((state) => state.initialize);
  const reminders = useReminderStore((state) => state.reminders);
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const focused = useTabFocused();
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    initialize().catch((error) => logger.error('Could not load reminder prompts', error));
  }, [initialize]);

  const shown = promptToShow(prompts, reminders);
  if (hidden || !focused || shown === null) {
    return null;
  }
  const { prompt, reminder } = shown;

  const answer = async (reply: () => Promise<unknown>) => {
    setAnswering(true);
    try {
      await reply();
    } finally {
      setAnswering(false);
    }
  };
  const firedAt = format(parseISO(prompt.firedAt), timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
  const cadence = reminder.recurring ? formatReminderCadence(reminder.recurring) : null;

  return (
    <div
      role="alert"
      className={cn(
        'fixed bottom-20 z-[60] w-96 max-w-[calc(100vw-2rem)] rounded-2xl border-2 p-4 shadow-2xl',
        'bg-surface-elevated backdrop-blur-xl border-red-400/40 animate-slide-up reminder-glow-pulse',
        rightPosition
      )}
    >
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 flex-none inline-flex items-center justify-center rounded-lg border bg-red-400/10 border-red-400/40 text-red-400">
          <BellRing className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-primary break-words">{reminder.text}</p>
          <p className="text-xs text-secondary mt-0.5">
            {firedAt}
            {cadence !== null ? ` · ${cadence}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => answer(() => removeReminderPrompt(reminder.id))}
          disabled={answering}
          aria-label="Dismiss reminder"
          title="Dismiss — it stays in Needs response"
          className="flex-none p-1 rounded-full text-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 pt-3 border-t border-red-400/40 flex items-center justify-between gap-2">
        <ReminderSnoozeRow
          state="notified"
          onSnooze={(minutes) =>
            answer(() => respondToReminder(reminder.id, REMINDER_SNOOZE_BUTTON, minutes))
          }
        />
        <button
          type="button"
          onClick={() => answer(() => respondToReminder(reminder.id, REMINDER_DONE_BUTTON))}
          disabled={answering}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary-600 text-white hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <Check className="w-3.5 h-3.5" />
          Done
        </button>
      </div>
    </div>
  );
}
