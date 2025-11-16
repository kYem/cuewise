import type { Goal, PomodoroSession } from '../types';

/**
 * Create test goals for analytics
 */
export function createTestGoals(): Goal[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  return [
    // Today - 2 goals (1 completed)
    {
      id: 'goal-1',
      text: 'Complete project',
      completed: true,
      createdAt: today.toISOString(),
      date: today.toISOString().split('T')[0],
    },
    {
      id: 'goal-2',
      text: 'Review code',
      completed: false,
      createdAt: today.toISOString(),
      date: today.toISOString().split('T')[0],
    },
    // Yesterday - 1 goal (completed)
    {
      id: 'goal-3',
      text: 'Write tests',
      completed: true,
      createdAt: yesterday.toISOString(),
      date: yesterday.toISOString().split('T')[0],
    },
    // Last week - 2 goals (both completed)
    {
      id: 'goal-4',
      text: 'Deploy to production',
      completed: true,
      createdAt: lastWeek.toISOString(),
      date: lastWeek.toISOString().split('T')[0],
    },
    {
      id: 'goal-5',
      text: 'Update documentation',
      completed: true,
      createdAt: lastWeek.toISOString(),
      date: lastWeek.toISOString().split('T')[0],
    },
    // Last month - 1 goal (not completed)
    {
      id: 'goal-6',
      text: 'Plan new features',
      completed: false,
      createdAt: lastMonth.toISOString(),
      date: lastMonth.toISOString().split('T')[0],
    },
  ];
}

/**
 * Create test pomodoro sessions for analytics
 */
export function createTestPomodoroSessions(): PomodoroSession[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Create sessions at different hours
  const session1 = new Date(today);
  session1.setHours(9, 0, 0, 0); // 9 AM

  const session2 = new Date(today);
  session2.setHours(14, 0, 0, 0); // 2 PM

  const session3 = new Date(today);
  session3.setHours(14, 30, 0, 0); // 2:30 PM (same hour as session2)

  const session4 = new Date(yesterday);
  session4.setHours(10, 0, 0, 0); // 10 AM yesterday

  return [
    // Today - 3 work sessions
    {
      id: 'session-1',
      startedAt: session1.toISOString(),
      completedAt: new Date(session1.getTime() + 25 * 60 * 1000).toISOString(),
      interrupted: false,
      duration: 25,
      type: 'work',
    },
    {
      id: 'session-2',
      startedAt: session2.toISOString(),
      completedAt: new Date(session2.getTime() + 25 * 60 * 1000).toISOString(),
      interrupted: false,
      duration: 25,
      type: 'work',
    },
    {
      id: 'session-3',
      startedAt: session3.toISOString(),
      completedAt: new Date(session3.getTime() + 25 * 60 * 1000).toISOString(),
      interrupted: false,
      duration: 25,
      type: 'work',
    },
    // Yesterday - 1 work session
    {
      id: 'session-4',
      startedAt: session4.toISOString(),
      completedAt: new Date(session4.getTime() + 25 * 60 * 1000).toISOString(),
      interrupted: false,
      duration: 25,
      type: 'work',
    },
    // Interrupted session (should be excluded)
    {
      id: 'session-5',
      startedAt: today.toISOString(),
      interrupted: true,
      duration: 10,
      type: 'work',
    },
    // Break session (should be excluded from work analytics)
    {
      id: 'session-6',
      startedAt: today.toISOString(),
      completedAt: new Date(today.getTime() + 5 * 60 * 1000).toISOString(),
      interrupted: false,
      duration: 5,
      type: 'break',
    },
  ];
}

/**
 * Create goals with consistent dates for trend testing
 */
export function createTrendTestGoals(days: number): Goal[] {
  const goals: Goal[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Create 1-3 goals per day with varying completion
    const goalCount = (i % 3) + 1;
    for (let j = 0; j < goalCount; j++) {
      goals.push({
        id: `goal-${i}-${j}`,
        text: `Goal ${i}-${j}`,
        completed: j === 0, // First goal of each day is completed
        createdAt: date.toISOString(),
        date: dateStr,
      });
    }
  }

  return goals;
}

/**
 * Create pomodoro sessions with consistent hours for heatmap testing
 */
export function createHeatmapTestSessions(): PomodoroSession[] {
  const sessions: PomodoroSession[] = [];
  const today = new Date();

  // Create sessions at specific hours to test heatmap
  const hours = [9, 9, 14, 14, 14, 16]; // 9 AM (2x), 2 PM (3x), 4 PM (1x)

  hours.forEach((hour, index) => {
    const date = new Date(today);
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() - (index % 5)); // Spread across week

    sessions.push({
      id: `session-${index}`,
      startedAt: date.toISOString(),
      completedAt: new Date(date.getTime() + 25 * 60 * 1000).toISOString(),
      interrupted: false,
      duration: 25,
      type: 'work',
    });
  });

  return sessions;
}
