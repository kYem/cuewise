import { describe, expect, it } from 'vitest';
import goals from './goals.json';
import reminders from './reminders.json';
import tasks from './tasks.json';

const assets = [
  { name: 'tasks.json', data: tasks },
  { name: 'goals.json', data: goals },
  { name: 'reminders.json', data: reminders },
];

describe('empty-state lottie assets', () => {
  for (const { name, data } of assets) {
    describe(name, () => {
      it('has the required top-level Lottie fields', () => {
        expect(typeof data.v).toBe('string');
        expect(typeof data.fr).toBe('number');
        expect(typeof data.ip).toBe('number');
        expect(typeof data.op).toBe('number');
        expect(typeof data.w).toBe('number');
        expect(typeof data.h).toBe('number');
      });

      it('contains at least one layer and is a finite clip', () => {
        expect(Array.isArray(data.layers)).toBe(true);
        expect(data.layers.length).toBeGreaterThan(0);
        expect(data.op).toBeGreaterThan(data.ip);
      });

      it('contains no Lottie expressions (CSP-safe)', () => {
        expect(JSON.stringify(data)).not.toMatch(/"x":"/);
      });
    });
  }
});
