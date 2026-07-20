import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundCredit } from './BackgroundCredit';

const CURATED_URL = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920';

describe('BackgroundCredit', () => {
  it('credits Unsplash for the current photo', () => {
    render(<BackgroundCredit imageUrl={CURATED_URL} onRefresh={vi.fn()} />);

    const link = screen.getByRole('link', { name: /unsplash/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('unsplash.com'));
  });

  it('says only that the photo is from Unsplash when the photographer is unknown', () => {
    // The credit spans a text node and the link, so assert on the rendered line as read.
    const { container } = render(<BackgroundCredit imageUrl={CURATED_URL} onRefresh={vi.fn()} />);

    expect(container.textContent).toContain('Photo from Unsplash');
    expect(container.textContent).not.toContain('Photo by');
  });

  it('offers a control to change the background', () => {
    render(<BackgroundCredit imageUrl={CURATED_URL} onRefresh={vi.fn()} />);

    expect(screen.getByRole('button', { name: /new background/i })).toBeInTheDocument();
  });

  it('asks for a new background when the control is pressed', () => {
    const onRefresh = vi.fn();
    render(<BackgroundCredit imageUrl={CURATED_URL} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /new background/i }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('blocks repeat presses while a refresh is in flight', () => {
    const onRefresh = vi.fn();
    render(<BackgroundCredit imageUrl={CURATED_URL} onRefresh={onRefresh} isRefreshing />);

    const button = screen.getByRole('button', { name: /new background/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('renders nothing without an image to credit', () => {
    const { container } = render(<BackgroundCredit imageUrl={null} onRefresh={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('credits nobody for an image the user supplied themselves', () => {
    const { container } = render(
      <BackgroundCredit imageUrl="data:image/jpeg;base64,abc123" onRefresh={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers no refresh control for a user-supplied image', () => {
    render(<BackgroundCredit imageUrl="data:image/jpeg;base64,abc123" onRefresh={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /new background/i })).not.toBeInTheDocument();
  });
});
