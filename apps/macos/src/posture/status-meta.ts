import type { PostureStatus } from '@cuewise/shared';

/** Shared status presentation for the Settings panel and the new-tab chip. */
export const STATUS_META: Record<PostureStatus, { label: string; dot: string }> = {
  good: { label: 'Good posture', dot: 'bg-emerald-500' },
  mild: { label: 'Ease up', dot: 'bg-amber-500' },
  poor: { label: 'Sit back', dot: 'bg-rose-500' },
  absent: { label: 'No face in frame', dot: 'bg-tertiary' },
};
