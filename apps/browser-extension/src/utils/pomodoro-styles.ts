import { Coffee, Timer } from 'lucide-react';
import type { ComponentType } from 'react';

export type SessionType = 'work' | 'break' | 'longBreak';

export interface SessionStyles {
  color: string;
  bgColor: string;
  borderColor: string;
  progressColor: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * Get styling configuration for a Pomodoro session type
 */
export function getSessionStyles(sessionType: SessionType): SessionStyles {
  switch (sessionType) {
    case 'break':
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        borderColor: 'border-green-600',
        progressColor: '#10B981',
        label: 'Short Break',
        icon: Coffee,
      };
    case 'longBreak':
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        borderColor: 'border-blue-600',
        progressColor: '#3B82F6',
        label: 'Long Break',
        icon: Coffee,
      };
    case 'work':
    default:
      return {
        color: 'text-primary-600',
        bgColor: 'bg-primary-100',
        borderColor: 'border-primary-600',
        progressColor: '#8B5CF6',
        label: 'Focus Session',
        icon: Timer,
      };
  }
}
