import { MAX_WORLD_CLOCKS } from '@cuewise/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AUCKLAND_ZONE, NEW_YORK_ZONE, TOKYO_ZONE } from '../__fixtures__/world-clock.fixtures';
import { WorldClockSettings } from './WorldClockSettings';

vi.mock('../../utils/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/weather')>()),
  searchLocations: vi.fn(async () => []),
}));

describe('WorldClockSettings', () => {
  it('renames a city when its label loses focus', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith([{ ...TOKYO_ZONE, label: 'Kenji' }]);
  });

  it('moves a city up', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE, NEW_YORK_ZONE]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move NYC team up' }));

    expect(onChange).toHaveBeenCalledWith([NEW_YORK_ZONE, TOKYO_ZONE]);
  });

  it('cannot move the first city up', () => {
    render(<WorldClockSettings zones={[TOKYO_ZONE, NEW_YORK_ZONE]} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Move Tokyo up' })).toBeDisabled();
  });

  it('removes a city', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE, NEW_YORK_ZONE]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tokyo' }));

    expect(onChange).toHaveBeenCalledWith([NEW_YORK_ZONE]);
  });

  it('adds a picked city to the end', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search for a city' }), {
      target: { value: 'auckland' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auckland/ }));

    expect(onChange).toHaveBeenCalledWith([
      TOKYO_ZONE,
      expect.objectContaining({ label: 'Auckland', timezone: 'Pacific/Auckland' }),
    ]);
  });

  it('stops offering the search once the list is full', () => {
    const full = Array.from({ length: MAX_WORLD_CLOCKS }, (_, i) => ({
      ...AUCKLAND_ZONE,
      id: `z${i}`,
      label: `City ${i}`,
    }));
    render(<WorldClockSettings zones={full} onChange={vi.fn()} />);

    expect(screen.queryByRole('textbox', { name: 'Search for a city' })).not.toBeInTheDocument();
    expect(screen.getByText(`Up to ${MAX_WORLD_CLOCKS} cities.`)).toBeInTheDocument();
  });
});
