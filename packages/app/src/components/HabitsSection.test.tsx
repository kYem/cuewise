import { HABIT_HISTORY_SYNC_NOTICE } from '@cuewise/shared';
import { reminderFactory } from '@cuewise/test-utils/factories';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HabitsSection } from './HabitsSection';

const water = reminderFactory.build({
  id: 'h1',
  text: 'Drink water',
  recurring: { frequency: 'interval', intervalMinutes: 60 },
});

function kept(date: string) {
  return { id: `h1:${date}`, reminderId: 'h1', date, count: 1 };
}

describe('HabitsSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T20:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing without habits', () => {
    const { container } = render(
      <HabitsSection habits={[]} habitHistory={[]} chromeSyncOn={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a row per habit with its streak and best', () => {
    render(
      <HabitsSection
        habits={[water]}
        habitHistory={[kept('2026-10-04'), kept('2026-10-05')]}
        chromeSyncOn={false}
      />
    );

    expect(screen.getByText('Kept Today')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.getByText('2 d')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Drink water: 2 of the last 30 days kept' })
    ).toBeInTheDocument();
  });

  it('names the habit behind the longest running streak and its best', () => {
    render(
      <HabitsSection
        habits={[water]}
        habitHistory={[kept('2026-10-04'), kept('2026-10-05')]}
        chromeSyncOn={false}
      />
    );

    const tile = within(screen.getByTestId('habit-streak-tile'));
    expect(tile.getByText('2')).toBeInTheDocument();
    expect(tile.getByText('Drink water · best this year: 2 days')).toBeInTheDocument();
  });

  it('shows a dash and no habit on the streak tile when every streak is broken', () => {
    render(
      <HabitsSection habits={[water]} habitHistory={[kept('2026-10-02')]} chromeSyncOn={false} />
    );

    const tile = within(screen.getByTestId('habit-streak-tile'));
    expect(tile.getByText('—')).toBeInTheDocument();
    expect(tile.getByText('No streak yet')).toBeInTheDocument();
    expect(tile.queryByText(/Drink water/)).toBeNull();
  });

  it('shows the 30-day rate as a bar and a percentage', () => {
    render(
      <HabitsSection
        habits={[water]}
        habitHistory={[kept('2026-10-02'), kept('2026-10-05')]}
        chromeSyncOn={false}
      />
    );

    const rate = screen.getByTestId('habit-rate-h1');
    expect(within(rate).getByText('50%')).toBeInTheDocument();
    expect(within(rate).getByTestId('habit-rate-fill')).toHaveStyle({ width: '50%' });
  });

  it('shows a dash and an empty bar when no day has been rated yet', () => {
    render(<HabitsSection habits={[water]} habitHistory={[]} chromeSyncOn={false} />);

    const rate = screen.getByTestId('habit-rate-h1');
    expect(within(rate).getByText('—')).toBeInTheDocument();
    expect(within(rate).getByTestId('habit-rate-fill')).toHaveStyle({ width: '0%' });
  });

  it('says history stays on this device while Chrome sync is on', () => {
    render(<HabitsSection habits={[water]} habitHistory={[]} chromeSyncOn />);

    expect(screen.getByText(HABIT_HISTORY_SYNC_NOTICE)).toBeInTheDocument();
  });

  it('omits the sync notice while Chrome sync is off', () => {
    render(<HabitsSection habits={[water]} habitHistory={[]} chromeSyncOn={false} />);

    expect(screen.queryByText(HABIT_HISTORY_SYNC_NOTICE)).toBeNull();
  });
});
