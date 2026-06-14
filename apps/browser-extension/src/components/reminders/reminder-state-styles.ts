import type { ReminderCategory } from '@cuewise/shared';
import { Briefcase, HeartPulse, type LucideIcon, Sparkles } from 'lucide-react';
import type { ReminderState } from '../../utils/reminder-classify';

export interface ReminderStateStyle {
  /** Foreground/accent text class. */
  text: string;
  /** Border class. */
  border: string;
  /** Background class. */
  bg: string;
  /** Accent-tinted chip styling for snooze actions. */
  chip: { bg: string; text: string; border: string };
  /** Human-readable state label. */
  label: string;
}

/** Severity ramp (calm primary → red), as Tailwind token classes per state. */
export const REMINDER_STATE_STYLES: Record<ReminderState, ReminderStateStyle> = {
  notified: {
    text: 'text-red-400',
    border: 'border-red-400/40',
    bg: 'bg-red-400/10',
    chip: { bg: 'bg-red-400/20', text: 'text-red-400', border: 'border-red-400/40' },
    label: 'Needs response',
  },
  overdue: {
    text: 'text-orange-500',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
    chip: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
    label: 'Overdue',
  },
  soon: {
    text: 'text-amber-500',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    chip: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' },
    label: 'Due soon',
  },
  upcoming: {
    text: 'text-primary-600',
    border: 'border-border',
    bg: 'bg-surface',
    chip: { bg: 'bg-primary-500/15', text: 'text-primary-600', border: 'border-primary-500/40' },
    label: 'Upcoming',
  },
  done: {
    text: 'text-tertiary',
    border: 'border-border',
    bg: 'bg-surface-variant',
    chip: { bg: 'bg-surface-variant', text: 'text-tertiary', border: 'border-border' },
    label: 'Done',
  },
};

/** Lucide icon per reminder category; color comes from REMINDER_CATEGORY_META. */
export const REMINDER_CATEGORY_ICON: Record<ReminderCategory, LucideIcon> = {
  health: HeartPulse,
  productivity: Briefcase,
  personal: Sparkles,
};
