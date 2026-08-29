/** The handler validates against this same list; a page-only value renders a radio it rejects. */
export const FEEDBACK_AREAS = [
  { value: 'widgets', label: 'A widget for the home screen' },
  { value: 'goals', label: 'Goals & tasks' },
  { value: 'pomodoro', label: 'Pomodoro & focus' },
  { value: 'quotes', label: 'Quotes & concept cards' },
  { value: 'reminders', label: 'Reminders & habits' },
  { value: 'sync', label: 'Sync & devices' },
  { value: 'other', label: 'Something else' },
] as const;

export type FeedbackArea = (typeof FEEDBACK_AREAS)[number]['value'];

const AREA_VALUES = FEEDBACK_AREAS.map((area) => area.value);

export function isFeedbackArea(value: string): value is FeedbackArea {
  return AREA_VALUES.some((area) => area === value);
}
