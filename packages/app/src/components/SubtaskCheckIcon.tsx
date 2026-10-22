import type React from 'react';
import { AnimatedCheckbox } from './AnimatedCheckbox';

export function SubtaskCheckIcon({ completed }: { completed: boolean }): React.ReactElement {
  return <AnimatedCheckbox checked={completed} size="sm" className="flex-shrink-0" />;
}

export function subtaskToggleLabel(text: string, completed: boolean): string {
  return completed ? `Mark "${text}" incomplete` : `Mark "${text}" complete`;
}
