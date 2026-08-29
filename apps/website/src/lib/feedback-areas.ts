/**
 * Shared by the form page and the API handler — both are in this package's tsconfig, so a radio
 * the handler would 400 cannot be rendered. Drift here costs a user their typed-out request.
 */
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

const AREA_VALUES: readonly string[] = FEEDBACK_AREAS.map((area) => area.value);

export function isFeedbackArea(value: string): value is FeedbackArea {
  return AREA_VALUES.includes(value);
}
