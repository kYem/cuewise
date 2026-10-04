import { calculatePomodoroHeatmap } from '@cuewise/shared';
import { pomodoroFactory } from '@cuewise/test-utils/factories';

/** A completed local-time work session on 2026-07-{day} (the 7th is a Tuesday). */
function completedAt(day: number, hour: number, minute = 0) {
  return pomodoroFactory.build({ completedAt: new Date(2026, 6, day, hour, minute).toISOString() });
}

/** Six Tuesday-morning sessions (four in 9–10 AM) and six spread over the rest of the week. */
export function tuesdayMorningGrid(): number[][] {
  return calculatePomodoroHeatmap([
    completedAt(7, 9),
    completedAt(7, 9, 15),
    completedAt(7, 9, 30),
    completedAt(7, 9, 45),
    completedAt(7, 10),
    completedAt(7, 11),
    completedAt(6, 14),
    completedAt(6, 15),
    completedAt(8, 9),
    completedAt(9, 19),
    completedAt(10, 22),
    completedAt(11, 13),
  ]).weekdayHourDistribution;
}

export function emptyGrid(): number[][] {
  return calculatePomodoroHeatmap([]).weekdayHourDistribution;
}
