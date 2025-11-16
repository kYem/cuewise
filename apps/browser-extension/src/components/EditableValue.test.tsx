import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditableValue } from './EditableValue';

describe('EditableValue', () => {
  const defaultProps = {
    value: 25,
    unit: 'minutes',
    min: 1,
    max: 60,
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
      expect(button).toHaveAttribute('title', 'Click to edit (1-60 minutes)');
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

    it('should show input field when clicking and no presets provided', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      const button = screen.getByRole('button');
      await user.click(button);

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(25);
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

      // Presets + "Custom..." option
      expect(options).toHaveLength(presets.length + 1);
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

    it('should switch to input mode when selecting "Custom..."', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} presets={presets} />);

      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox');

      await user.selectOptions(select, 'custom');

      await waitFor(() => {
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });
    });

    it('should show current value as selected in dropdown', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} value={30} presets={presets} />);

      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox') as HTMLSelectElement;

      expect(select.value).toBe('30');
    });

    it('should select "Custom..." when current value is not in presets', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} value={35} presets={presets} />);

      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox') as HTMLSelectElement;

      expect(select.value).toBe('custom');
    });
  });

  describe('Custom Input Mode', () => {
    it('should focus and select the input text on mount', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      await user.click(screen.getByRole('button'));

      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input).toHaveFocus();
    });

    it('should update input value as user types', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '30');

      expect(input).toHaveValue(30);
    });

    it('should enforce min/max constraints', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '60');
    });
  });

  describe('Saving Changes', () => {
    it('should save valid value on blur', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '30');
      await user.tab(); // Trigger blur

      expect(onChange).toHaveBeenCalledWith(30);
    });

    it('should save value when pressing Enter', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '45');
      await user.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith(45);
    });

    it('should exit edit mode after saving', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '30{Enter}');

      await waitFor(() => {
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should reject values below minimum', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} min={10} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '5{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should reject values above maximum', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} max={60} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '100{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should reject non-numeric values', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, 'abc{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should reset to original value when validation fails', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} value={25} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '100{Enter}');

      // Should exit edit mode with original value
      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toHaveTextContent('25 minutes');
      });
    });
  });

  describe('Cancel Editing', () => {
    it('should cancel editing when pressing Escape', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<EditableValue {...defaultProps} onChange={onChange} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '50');
      await user.keyboard('{Escape}');

      expect(onChange).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      });
    });

    it('should restore original value when canceling', async () => {
      const user = userEvent.setup();

      render(<EditableValue {...defaultProps} value={25} />);

      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('spinbutton');

      await user.clear(input);
      await user.type(input, '50');
      await user.keyboard('{Escape}');

      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toHaveTextContent('25 minutes');
      });
    });
  });

  describe('Value Updates', () => {
    it('should update input when value prop changes', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<EditableValue {...defaultProps} value={25} />);

      await user.click(screen.getByRole('button'));

      // Change value prop while editing
      rerender(<EditableValue {...defaultProps} value={30} />);

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(30);
    });

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
