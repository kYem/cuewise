import type { Reminder, ReminderPanelLayout } from '@cuewise/shared';

/** Pinned state + setter for the in-header pin toggle (keeps the panel open). */
export interface PanelPinToggle {
  pinned: boolean;
  onChange: (next: boolean) => void;
}

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
  /** Current pinned state + setter, to show an in-header pin toggle. When omitted, no pin renders. */
  pinToggle?: PanelPinToggle;
  /** Current panel layout + setter, to show an in-header view switcher. When omitted, no switcher renders. */
  viewSwitcher?: { layout: ReminderPanelLayout; onChange: (layout: ReminderPanelLayout) => void };
}
