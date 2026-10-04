import { createSelectorMock } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settings-store';
import { emptyGrid, tuesdayMorningGrid } from './__fixtures__/focus-heatmap.fixtures';
import { FocusHeatmap } from './FocusHeatmap';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));

function useTimeFormat(timeFormat: '12h' | '24h') {
  vi.mocked(useSettingsStore).mockImplementation(createSelectorMock({ settings: { timeFormat } }));
}

describe('FocusHeatmap', () => {
  beforeEach(() => {
    useTimeFormat('12h');
  });

  it('names the strongest weekday and part of day', () => {
    render(<FocusHeatmap data={tuesdayMorningGrid()} />);

    expect(screen.getByText('Most focused: Tuesday mornings')).toBeInTheDocument();
  });

  it('asks for more sessions instead of guessing with no data', () => {
    render(<FocusHeatmap data={emptyGrid()} />);

    expect(
      screen.getByText('Complete a few more sessions to see your pattern')
    ).toBeInTheDocument();
  });

  it('draws seven weekday rows of 24 hours, Monday first', () => {
    render(<FocusHeatmap data={emptyGrid()} />);

    const weekdays = screen.getAllByRole('rowheader').map((header) => header.textContent);
    expect(weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(screen.getAllByRole('button', { name: /session/ })).toHaveLength(7 * 24);
  });

  it('shows the hour and session count for a hovered cell', () => {
    render(<FocusHeatmap data={tuesdayMorningGrid()} />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Tue 9 AM–10 AM · 4 sessions' }));

    expect(screen.getByRole('tooltip')).toHaveTextContent('Tue 9 AM–10 AM · 4 sessions');
  });

  it('labels an empty cell as having no sessions, in the 24-hour clock when set', () => {
    useTimeFormat('24h');

    render(<FocusHeatmap data={emptyGrid()} />);

    expect(
      screen.getByRole('button', { name: 'Wed 23:00–00:00 · no sessions' })
    ).toBeInTheDocument();
  });

  it('moves keyboard focus between cells with the arrow keys', () => {
    render(<FocusHeatmap data={tuesdayMorningGrid()} />);
    const first = screen.getByRole('button', { name: 'Mon 12 AM–1 AM · no sessions' });
    first.focus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });

    const below = screen.getByRole('button', { name: 'Tue 12 AM–1 AM · no sessions' });
    expect(below).toHaveFocus();
    expect(below).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
  });
});
