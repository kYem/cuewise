import { describe, expect, it } from 'vitest';
import { buildDemoSeed, DEMO_BACKGROUND_URL, writeDemoSeed } from '../public/scripts/demo-seed.js';
import { fakeStorage } from './__fixtures__/storage.fixtures';

const NOON = new Date(2026, 10, 23, 12, 0, 0);
const MINUTE = 60 * 1000;

describe('buildDemoSeed', () => {
  it('writes exactly the keys the app reads', () => {
    expect(Object.keys(buildDemoSeed(NOON)).sort()).toEqual([
      'conceptCards',
      'currentQuote',
      'dailyBackground',
      'goals',
      'pomodoroSessions',
      'pomodoroState',
      'settings.conceptCadence',
      'settings.hasSeenOnboarding',
      'settings.reviewPromptDismissed',
    ]);
  });

  it('keeps the concept card off the home view until Recall asks for it', () => {
    expect(buildDemoSeed(NOON)['settings.conceptCadence']).toBe('off');
  });

  it('skips the onboarding and the review prompt', () => {
    expect(buildDemoSeed(NOON)).toMatchObject({
      'settings.hasSeenOnboarding': true,
      'settings.reviewPromptDismissed': true,
    });
  });

  it('has three goals today, one of them done', () => {
    const today = buildDemoSeed(NOON).goals.filter((goal) => goal.date === '2026-11-23');
    expect(today).toHaveLength(3);
    expect(today.filter((goal) => goal.completed)).toHaveLength(1);
  });

  it('has a completed goal on each of the 17 days ending today', () => {
    const expectedDays = Array.from(
      { length: 17 },
      (_, n) => `2026-11-${String(23 - n).padStart(2, '0')}`
    );
    const completedDays = new Set(
      buildDemoSeed(NOON)
        .goals.filter((goal) => goal.completed)
        .map((goal) => goal.date)
    );
    expect([...completedDays].sort()).toEqual([...expectedDays].sort());
  });

  it('dates no session in the future, even just after midnight', () => {
    const justAfterMidnight = new Date(2026, 10, 23, 0, 10, 0);
    for (const s of buildDemoSeed(justAfterMidnight).pomodoroSessions) {
      expect(new Date(s.completedAt).getTime()).toBeLessThanOrEqual(justAfterMidnight.getTime());
    }
  });

  it('has four finished work sessions of 25 minutes ending before now', () => {
    const todays = buildDemoSeed(NOON).pomodoroSessions.filter((s) =>
      s.id.startsWith('demo-s-today-')
    );
    expect(todays.map((s) => s.id).sort()).toEqual([
      'demo-s-today-1',
      'demo-s-today-2',
      'demo-s-today-3',
      'demo-s-today-4',
    ]);
    for (const s of todays) {
      expect(s).toMatchObject({ type: 'work', duration: 25, interrupted: false });
      const lengthMs = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
      expect(lengthMs).toBe(25 * MINUTE);
      expect(new Date(s.completedAt).getTime()).toBeLessThan(NOON.getTime());
    }
  });

  it('spreads five sessions over each weekday of the three weeks before today', () => {
    const earlier = buildDemoSeed(NOON).pomodoroSessions.filter(
      (s) => !s.id.startsWith('demo-s-today-')
    );
    const days = new Set(earlier.map((s) => new Date(s.startedAt).getDay()));
    expect([...days].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(earlier).toHaveLength(15 * 5);
  });

  it('has exactly one concept card due today', () => {
    const cards = buildDemoSeed(NOON).conceptCards;
    expect(cards).toHaveLength(3);
    expect(cards.filter((card) => card.schedule.dueDate === '2026-11-23')).toHaveLength(1);
  });

  it('starts the timer paused at 24:16', () => {
    expect(buildDemoSeed(NOON).pomodoroState).toMatchObject({
      version: 0,
      state: { status: 'paused', sessionType: 'work', timeRemaining: 1456, totalTime: 1500 },
    });
  });

  it('pins the quote the screenshots show', () => {
    expect(buildDemoSeed(NOON).currentQuote).toMatchObject({
      id: 'seed-89',
      text: 'The first wealth is health.',
      author: 'Ralph Waldo Emerson',
    });
  });

  it('pins the daily background to today', () => {
    expect(buildDemoSeed(NOON).dailyBackground).toEqual({
      url: DEMO_BACKGROUND_URL,
      category: 'nature',
      date: '2026-11-23',
    });
  });
});

describe('writeDemoSeed', () => {
  it('replaces earlier demo data but keeps keys the site owns', () => {
    const storage = fakeStorage({ goals: '[1]', stale: 'x', 'site.banner': 'dismissed' });
    writeDemoSeed(storage, NOON);
    expect(storage.getItem('stale')).toBeNull();
    expect(storage.getItem('site.banner')).toBe('dismissed');
    expect(JSON.parse(storage.getItem('goals') ?? '[]')).toHaveLength(35);
  });
});
