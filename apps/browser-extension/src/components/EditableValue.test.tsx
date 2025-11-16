import { render, screen, waitFor } from '@testing-library/react';
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

      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('25 minutes');
    });

    it('should show helpful title on hover', () => {
      render(<EditableValue {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Click to edit');
    });

    it('should apply custom className', () => {
      render(<EditableValue {...defaultProps} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Entering Edit Mode', () => {
    it('should show select dropdown when clicking and presets are provided', async () => {
      const user = userEvent.setup();
      const presets = [15, 20, 25, 30];

      render(<EditableValue {...defaultProps} presets={presets} />);

      const button = screen.getByRole('button');
      await user.click(button);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('should show fallback text when no presets provided', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      const button = screen.getByRole('button');
      await user.click(button);

      // Should show fallback span
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    });
  });

  describe('Preset Selection', () => {
    const presets = [15, 20, 25, 30, 45, 60];

    it('should display all preset options', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));

      const select = screen.getByRole('combobox');
      const options = select.querySelectorAll('option');

      // Only presets, no custom option
      expect(options).toHaveLength(presets.length);
    });

    it('should call onChange when selecting a preset', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} presets={presets} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox');

      await user.selectOptions(select, '30');

      expect(onChange).toHaveBeenCalledWith(30);
    });

    it('should exit edit mode after selecting a preset', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox');

      await user.selectOptions(select, '30');

      await waitFor(() => {
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should show current value as selected in dropdown', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} value={30} presets={presets} />);

      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox') as HTMLSelectElement;

      expect(select.value).toBe('30');
    });

    it('should focus select dropdown when entering edit mode', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));

      const select = screen.getByRole('combobox');
      await waitFor(() => {
        expect(select).toHaveFocus();
      });
    });

    it('should exit edit mode on blur', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));

      await user.tab(); // Trigger blur

      await waitFor(() => {
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button')).toBeInTheDocument();
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
