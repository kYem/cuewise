import { Factory } from 'fishery';
import type { PomodoroSession } from '@cuewise/shared';

export const pomodoroFactory = Factory.define<PomodoroSession>(({ sequence }) => ({
  id: `pomodoro-${sequence}`,
  startedAt: new Date().toISOString(),
  completedAt: undefined,
  interrupted: false,
  duration: 25,
  type: 'work' as const,
}));

export const completedPomodoroFactory = pomodoroFactory.params({
  completedAt: new Date().toISOString(),
});

export const breakPomodoroFactory = pomodoroFactory.params({
  duration: 5,
  type: 'break' as const,
});

export const interruptedPomodoroFactory = pomodoroFactory.params({
  interrupted: true,
  completedAt: new Date().toISOString(),
});
