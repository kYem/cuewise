import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeScheduler } from './chrome-scheduler';

type AlarmListener = (alarm: { name: string }) => void;

const alarms = {
  create: vi.fn(() => Promise.resolve()),
  clear: vi.fn(() => Promise.resolve(true)),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

beforeEach(() => {
  (chrome as unknown as { alarms: typeof alarms }).alarms = alarms;
  alarms.create.mockClear();
  alarms.clear.mockClear();
  alarms.onAlarm.addListener.mockClear();
  alarms.onAlarm.removeListener.mockClear();
});

describe('ChromeScheduler', () => {
  it('arms an alarm at the given time using the id verbatim', async () => {
    const when = new Date('2026-07-07T10:00:00Z');

    await new ChromeScheduler().scheduleAt('reminder-1', when);

    expect(alarms.create).toHaveBeenCalledWith('reminder-1', { when: when.getTime() });
  });

  it('cancels an alarm by id', async () => {
    await new ChromeScheduler().cancel('reminder-1');

    expect(alarms.clear).toHaveBeenCalledWith('reminder-1');
  });

  it('fires the handler with the alarm id and unsubscribes cleanly', () => {
    const handler = vi.fn();
    const scheduler = new ChromeScheduler();

    const unsubscribe = scheduler.onFire(handler);
    const listener = alarms.onAlarm.addListener.mock.calls[0][0] as AlarmListener;
    listener({ name: 'reminder-42' });

    expect(handler).toHaveBeenCalledWith('reminder-42');

    unsubscribe();
    expect(alarms.onAlarm.removeListener).toHaveBeenCalledWith(listener);
  });
});
