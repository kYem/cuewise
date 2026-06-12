import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewPromptModal } from './ReviewPromptModal';

const handlers = () => ({ onReview: vi.fn(), onLater: vi.fn(), onDismiss: vi.fn() });

describe('ReviewPromptModal', () => {
  it('renders nothing when closed', () => {
    const h = handlers();
    render(<ReviewPromptModal isOpen={false} {...h} />);

    expect(screen.queryByText('Enjoying Cuewise?')).not.toBeInTheDocument();
  });

  it('calls onReview from "Leave a review"', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPromptModal isOpen {...h} />);

    await user.click(screen.getByRole('button', { name: 'Leave a review' }));

    expect(h.onReview).toHaveBeenCalledTimes(1);
    expect(h.onLater).not.toHaveBeenCalled();
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('calls onLater from "Maybe later"', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPromptModal isOpen {...h} />);

    await user.click(screen.getByRole('button', { name: 'Maybe later' }));

    expect(h.onLater).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss from "Don\'t ask again"', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPromptModal isOpen {...h} />);

    await user.click(screen.getByRole('button', { name: "Don't ask again" }));

    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('treats Escape as "later"', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPromptModal isOpen {...h} />);

    await user.keyboard('{Escape}');

    expect(h.onLater).toHaveBeenCalledTimes(1);
  });

  it('treats a backdrop click as "later"', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPromptModal isOpen {...h} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss review prompt' }));

    expect(h.onLater).toHaveBeenCalledTimes(1);
  });
});
