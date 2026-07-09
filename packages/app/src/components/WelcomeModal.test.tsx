import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeModal } from './WelcomeModal';

describe('WelcomeModal', () => {
  it('should render when isOpen is true', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Welcome to Cuewise!')).toBeInTheDocument();
    expect(screen.getByText('Your personal productivity companion')).toBeInTheDocument();
  });

  it('should not render when isOpen is false', () => {
    render(<WelcomeModal isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByText('Welcome to Cuewise!')).not.toBeInTheDocument();
  });

  it('should display quick start tips', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Quick Start')).toBeInTheDocument();
    expect(screen.getByText('Add a goal')).toBeInTheDocument();
    expect(screen.getByText('Browse quotes')).toBeInTheDocument();
    expect(screen.getByText('Start a Pomodoro')).toBeInTheDocument();
  });

  it('should call onClose when "Get Started" button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    const getStartedButton = screen.getByRole('button', { name: 'Get Started' });
    await user.click(getStartedButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    const backdrop = screen.getByLabelText('Close welcome modal');
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Escape key is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<WelcomeModal isOpen={true} onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
