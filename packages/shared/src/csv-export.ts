import type { DailyDataPoint, Goal, MonthlyTrend, PomodoroSession, WeeklyTrend } from './types';

/**
 * Convert data to CSV format
 */
function convertToCSV(data: Array<Record<string, unknown>>, headers: string[]): string {
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      const escaped = String(value ?? '').replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Export daily trends to CSV
 */
export function exportDailyTrendsCSV(trends: DailyDataPoint[]): string {
  return convertToCSV(trends as unknown as Array<Record<string, unknown>>, [
    'date',
    'goalsCompleted',
    'focusTime',
    'pomodorosCompleted',
  ]);
}

/**
 * Export weekly trends to CSV
 */
export function exportWeeklyTrendsCSV(trends: WeeklyTrend[]): string {
  return convertToCSV(trends as unknown as Array<Record<string, unknown>>, [
    'weekLabel',
    'goalsCompleted',
    'focusTime',
    'pomodorosCompleted',
  ]);
}

/**
 * Export monthly trends to CSV
 */
export function exportMonthlyTrendsCSV(trends: MonthlyTrend[]): string {
  return convertToCSV(trends as unknown as Array<Record<string, unknown>>, [
    'month',
    'goalsCompleted',
    'focusTime',
    'pomodorosCompleted',
  ]);
}

/**
 * Export goals to CSV
 */
export function exportGoalsCSV(goals: Goal[]): string {
  const goalsData = goals.map((goal) => ({
    id: goal.id,
    text: goal.text,
    completed: goal.completed,
    createdAt: goal.createdAt,
    date: goal.date,
  }));
  return convertToCSV(goalsData, ['id', 'text', 'completed', 'createdAt', 'date']);
}

/**
 * Export pomodoro sessions to CSV
 */
export function exportPomodoroSessionsCSV(sessions: PomodoroSession[]): string {
  const sessionsData = sessions.map((session) => ({
    id: session.id,
    startedAt: session.startedAt,
    completedAt: session.completedAt || '',
    interrupted: session.interrupted,
    duration: session.duration,
    type: session.type,
    goalId: session.goalId || '',
  }));
  return convertToCSV(sessionsData, [
    'id',
    'startedAt',
    'completedAt',
    'interrupted',
    'duration',
    'type',
    'goalId',
  ]);
}

/**
 * Download a file in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
