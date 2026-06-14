import type { Reminder } from '@cuewise/shared';

/**
 * Shared contract for every reminders-panel layout variant (Composed, etc.).
 * The widget (Task 5) owns the positioned wrapper; panels render only the card.
 */
export interface ReminderPanelProps {
  /** Active reminders to render — panels group and sort internally. */
  reminders: Reminder[];
  /** store.toggleReminder — advancing a recurring reminder is its "ack". */
  onToggle: (id: string) => void;
  /** store.snoozeReminder. */
  onSnooze: (id: string, minutes: number) => void;
  /** store.setReminderPaused. */
  onPauseToggle: (id: string, paused: boolean) => void;
  /** Open the Add-reminder modal (footer button). */
  onAdd: () => void;
  /** Optional: open the "all reminders" manage modal (edit/delete live there). */
  onManage?: () => void;
}
