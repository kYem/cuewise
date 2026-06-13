import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditableValue } from './EditableValue';

describe('EditableValue', () => {
  const defaultProps = {
    value: 25,
    unit: 'minutes',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Display Mode', () => {
    it('should render the value with unit', () => {
      render(<EditableValue {...defaultProps} />);

      expect(screen.getByRole('button')).toHaveTextContent('25 minutes');
    });

    it('should show helpful title on hover', () => {
      render(<EditableValue {...defaultProps} />);

      expect(screen.getByRole('button')).toHaveAttribute('title', 'Click to edit');
    });

    it('should apply custom className', () => {
      render(<EditableValue {...defaultProps} className="custom-class" />);

      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('should render a compact label with a suffix', () => {
      render(<EditableValue {...defaultProps} compact suffix="m" />);

      expect(screen.getByRole('button')).toHaveTextContent('25m');
    });

    it('should render a compact label with no suffix and omit the unit', () => {
      render(<EditableValue {...defaultProps} value={4} unit="sessions" compact />);

      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('4');
      expect(button).not.toHaveTextContent('sessions');
    });
  });

  describe('Opening the preset menu', () => {
    const presets = [15, 20, 25, 30];

    it('opens the preset listbox on the first click', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('does not open a listbox when no presets are provided', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      await user.click(screen.getByRole('button'));

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Preset Selection', () => {
    const presets = [15, 20, 25, 30, 45, 60];

    it('displays all preset options', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));

      const options = within(screen.getByRole('listbox')).getAllByRole('option');
      expect(options).toHaveLength(presets.length);
    });

    it('calls onChange with the chosen preset', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} presets={presets} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('option', { name: '30 minutes' }));

      expect(onChange).toHaveBeenCalledWith(30);
    });

    it('closes the listbox after selecting a preset', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('option', { name: '30 minutes' }));

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('marks the current value as the selected option', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} value={30} presets={presets} />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByRole('option', { name: '30 minutes' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    it('closes the listbox when clicking outside', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <EditableValue {...defaultProps} presets={presets} />
          <button type="button">Outside</button>
        </div>
      );

      await user.click(screen.getByRole('button', { name: /25 minutes/i }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Outside' }));

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('keeps the full unit in preset options when the trigger is compact', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} compact suffix="m" presets={presets} />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByRole('option', { name: '30 minutes' })).toBeInTheDocument();
    });
  });

  describe('Value Updates', () => {
    it('should update display text when value prop changes', () => {
      const { rerender } = render(<EditableValue {...defaultProps} value={25} />);

      expect(screen.getByRole('button')).toHaveTextContent('25 minutes');

      rerender(<EditableValue {...defaultProps} value={30} />);

      expect(screen.getByRole('button')).toHaveTextContent('30 minutes');
    });
  });

  describe('Unit Display', () => {
    it('should display singular unit correctly', () => {
      render(<EditableValue {...defaultProps} value={1} unit="minute" />);

      expect(screen.getByRole('button')).toHaveTextContent('1 minute');
    });

    it('should display plural unit correctly', () => {
      render(<EditableValue {...defaultProps} value={25} unit="minutes" />);

      expect(screen.getByRole('button')).toHaveTextContent('25 minutes');
    });

    it('should handle different unit types', () => {
      render(<EditableValue {...defaultProps} value={4} unit="sessions" />);

      expect(screen.getByRole('button')).toHaveTextContent('4 sessions');
    });
  });
});
