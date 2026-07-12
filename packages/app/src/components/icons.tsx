/**
 * Icon utilities for consistent iconography across the app.
 * Update icons here to change them everywhere.
 */

import { Flag, ListTodo, Target } from 'lucide-react';
import type React from 'react';

// Icon components - change these to update icons app-wide
export const GoalIcon = Flag;
export const TaskIcon = ListTodo;
export const FocusIcon = Target; // For "Today's Focus" / daily focus

// Type guard icon getter
export function getTypeIcon(
  type: 'goal' | 'task' | 'focus'
): React.ComponentType<{ className?: string }> {
  switch (type) {
    case 'goal':
      return GoalIcon;
    case 'task':
      return TaskIcon;
    case 'focus':
      return FocusIcon;
    default:
      return TaskIcon;
  }
}

// Pre-styled icon components for common sizes
interface IconProps {
  className?: string;
}

export const GoalIconSmall: React.FC<IconProps> = ({ className = '' }) => (
  <GoalIcon className={`w-4 h-4 ${className}`} />
);

export const GoalIconMedium: React.FC<IconProps> = ({ className = '' }) => (
  <GoalIcon className={`w-5 h-5 ${className}`} />
);

export const GoalIconLarge: React.FC<IconProps> = ({ className = '' }) => (
  <GoalIcon className={`w-6 h-6 ${className}`} />
);

export const TaskIconSmall: React.FC<IconProps> = ({ className = '' }) => (
  <TaskIcon className={`w-4 h-4 ${className}`} />
);

export const TaskIconMedium: React.FC<IconProps> = ({ className = '' }) => (
  <TaskIcon className={`w-5 h-5 ${className}`} />
);

export const FocusIconSmall: React.FC<IconProps> = ({ className = '' }) => (
  <FocusIcon className={`w-4 h-4 ${className}`} />
);

export const FocusIconMedium: React.FC<IconProps> = ({ className = '' }) => (
  <FocusIcon className={`w-5 h-5 ${className}`} />
);

export const FocusIconLarge: React.FC<IconProps> = ({ className = '' }) => (
  <FocusIcon className={`w-6 h-6 ${className}`} />
);
