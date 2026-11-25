/**
 * @typedef {{ id: string, text: string, completed: boolean, createdAt: string, date: string,
 *   type: string }} DemoGoal
 * @typedef {{ id: string, startedAt: string, completedAt: string, interrupted: boolean,
 *   duration: number, type: string }} DemoSession
 * @typedef {{ dueDate: string, interval: number, easeFactor: number, repetitions: number,
 *   lapses: number }} DemoSchedule
 * @typedef {{ id: string, term: string, definition: string, tags: string[], createdAt: string,
 *   schedule: DemoSchedule }} DemoCard
 * @typedef {{ goals: DemoGoal[], pomodoroSessions: DemoSession[], conceptCards: DemoCard[],
 *   pomodoroState: Record<string, unknown>, dailyBackground: Record<string, unknown>,
 *   currentQuote: Record<string, unknown>, weather: Record<string, unknown>,
 *   'settings.showWeather': boolean, 'settings.weatherPosition': string,
 *   'settings.conceptCadence': string,
 *   'settings.hasSeenOnboarding': boolean, 'settings.reviewPromptDismissed': boolean }} DemoSeed
 */

const MINUTE_MS = 60 * 1000;
const SESSION_STARTS = [
  [9, 30],
  [10, 15],
  [11, 0],
  [14, 30],
  [15, 15],
];

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function daysAgo(now, n) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export const DEMO_BACKGROUND_URL =
  'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=1920&h=1080&fit=crop&auto=format';

export const DEMO_WEATHER_LOCATION = {
  id: '2643743',
  name: 'London',
  admin1: 'England',
  country: 'United Kingdom',
  countryCode: 'GB',
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: 'Europe/London',
};

function buildGoals(now) {
  const goal = (id, text, completed, daysBack) => {
    const day = daysAgo(now, daysBack);
    return {
      id,
      text,
      completed,
      createdAt: day.toISOString(),
      date: dayKey(day),
      type: 'task',
    };
  };
  const goals = [
    goal('demo-g1', 'Draft the launch post', true, 0),
    goal('demo-g2', 'Review two pull requests', false, 0),
    goal('demo-g3', 'Read for 30 minutes', false, 0),
  ];
  for (let n = 1; n <= 16; n++) {
    goals.push(goal(`demo-g-past-${n}-a`, 'Plan the day', true, n));
    goals.push(goal(`demo-g-past-${n}-b`, 'One hour of deep work', true, n));
  }
  return goals;
}

function buildSessions(now) {
  const session = (id, start) => ({
    id,
    startedAt: start.toISOString(),
    completedAt: new Date(start.getTime() + 25 * MINUTE_MS).toISOString(),
    interrupted: false,
    duration: 25,
    type: 'work',
  });
  const sessions = [];
  for (let n = 1; n <= 21; n++) {
    const day = daysAgo(now, n);
    if (day.getDay() === 0 || day.getDay() === 6) {
      continue;
    }
    for (const [hours, minutes] of SESSION_STARTS) {
      const start = new Date(day);
      start.setHours(hours, minutes, 0, 0);
      sessions.push(session(`demo-s-${start.getTime()}`, start));
    }
  }
  for (let i = 4; i >= 1; i--) {
    const start = new Date(now.getTime() - i * 40 * MINUTE_MS);
    sessions.push(session(`demo-s-today-${i}`, start));
  }
  return sessions;
}

function buildCards(now) {
  const card = (id, term, definition, daysUntilDue, interval, repetitions) => ({
    id,
    term,
    definition,
    tags: ['psychology'],
    createdAt: daysAgo(now, 10).toISOString(),
    schedule: {
      dueDate: dayKey(daysAgo(now, -daysUntilDue)),
      interval,
      easeFactor: 2.5,
      repetitions,
      lapses: 0,
    },
  });
  return [
    card(
      'demo-c1',
      'Confirmation bias',
      'The tendency to seek, interpret, and remember information in a way that confirms what you already believe.',
      0,
      1,
      1
    ),
    card(
      'demo-c2',
      'Anchoring',
      'Relying too heavily on the first piece of information encountered when making a decision.',
      3,
      6,
      2
    ),
    card(
      'demo-c3',
      'Sunk cost fallacy',
      'Continuing an endeavor because of already-invested resources rather than future value.',
      9,
      15,
      3
    ),
  ];
}

/**
 * @param {Date} now
 * @returns {DemoSeed}
 */
export function buildDemoSeed(now) {
  return {
    goals: buildGoals(now),
    pomodoroSessions: buildSessions(now),
    conceptCards: buildCards(now),
    pomodoroState: {
      state: {
        status: 'paused',
        sessionType: 'work',
        timeRemaining: 1456,
        totalTime: 1500,
        currentSessionId: 'demo-session',
        consecutiveWorkSessions: 0,
        selectedGoalId: null,
        lastTickTime: now.getTime(),
        sessions: [],
        workDuration: 25,
        breakDuration: 5,
        longBreakDuration: 15,
        longBreakInterval: 4,
        ambientSound: 'none',
        ambientVolume: 50,
      },
      version: 0,
    },
    dailyBackground: { url: DEMO_BACKGROUND_URL, category: 'nature', date: dayKey(now) },
    currentQuote: {
      id: 'seed-89',
      text: 'The first wealth is health.',
      author: 'Ralph Waldo Emerson',
      category: 'health',
      isCustom: false,
      isFavorite: false,
      isHidden: false,
      viewCount: 0,
    },
    weather: { location: DEMO_WEATHER_LOCATION, snapshot: null, lastFetch: null },
    'settings.showWeather': true,
    'settings.weatherPosition': 'right',
    'settings.conceptCadence': 'off',
    'settings.hasSeenOnboarding': true,
    'settings.reviewPromptDismissed': true,
  };
}

/**
 * @param {Storage} storage
 * @param {Date} now
 */
export function writeDemoSeed(storage, now) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    if (!key.startsWith('site.')) {
      storage.removeItem(key);
    }
  }
  for (const [key, value] of Object.entries(buildDemoSeed(now))) {
    storage.setItem(key, JSON.stringify(value));
  }
}
