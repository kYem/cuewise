import { MAX_WORLD_CLOCKS, type WorldClockZone } from '@cuewise/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AUCKLAND_ZONE, NEW_YORK_ZONE, TOKYO_ZONE } from '../__fixtures__/world-clock.fixtures';
import { WorldClockSettings } from './WorldClockSettings';

vi.mock('../../utils/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/weather')>()),
  searchLocations: vi.fn(async () => []),
}));

const SavingWorldClockSettings: React.FC<{ initial: WorldClockZone[] }> = ({ initial }) => {
  const [zones, setZones] = useState(initial);
  return <WorldClockSettings zones={zones} onChange={setZones} />;
};

describe('WorldClockSettings', () => {
  it('renames a city when its label loses focus', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith([{ ...TOKYO_ZONE, label: 'Kenji' }]);
  });

  it('renames a city on Enter', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith([{ ...TOKYO_ZONE, label: 'Kenji' }]);
  });

  it('drops an unsaved rename on Escape', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(input).toHaveValue('Tokyo');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps focus in the label after Enter saves it', () => {
    render(<SavingWorldClockSettings initial={[TOKYO_ZONE]} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    input.focus();
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('textbox', { name: 'Label for Kenji' })).toHaveFocus();
  });

  it('keeps Escape in the label from closing the settings around it', () => {
    const closeSettings = vi.fn();
    document.addEventListener('keydown', closeSettings);
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={vi.fn()} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    document.removeEventListener('keydown', closeSettings);

    expect(closeSettings).not.toHaveBeenCalled();
  });

  it('lets Escape close the settings when the label has no edit', () => {
    const closeSettings = vi.fn();
    document.addEventListener('keydown', closeSettings);
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Label for Tokyo' }), {
      key: 'Escape',
    });
    document.removeEventListener('keydown', closeSettings);

    expect(closeSettings).toHaveBeenCalled();
  });

  it('shows the saved label again when a blank rename changes nothing', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE]} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('Tokyo');
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

  it('keeps a rename when another row changes before the save lands', () => {
    const onChange = vi.fn();
    render(<WorldClockSettings zones={[TOKYO_ZONE, NEW_YORK_ZONE]} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Label for Tokyo' });
    fireEvent.change(input, { target: { value: 'Kenji' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'Remove NYC team' }));

    expect(onChange).toHaveBeenLastCalledWith([{ ...TOKYO_ZONE, label: 'Kenji' }]);
  });

  it('keeps both removals when two rows go in quick succession', () => {
    const onChange = vi.fn();
    render(
      <WorldClockSettings zones={[TOKYO_ZONE, NEW_YORK_ZONE, AUCKLAND_ZONE]} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tokyo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove NYC team' }));

    expect(onChange).toHaveBeenLastCalledWith([AUCKLAND_ZONE]);
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
