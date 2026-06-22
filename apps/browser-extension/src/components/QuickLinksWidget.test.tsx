import { createSelectorMock } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickLinksStore } from '../stores/quick-links-store';
import { QuickLinksWidget } from './QuickLinksWidget';

vi.mock('../stores/quick-links-store', () => ({
  useQuickLinksStore: vi.fn(),
}));

interface StoreOverrides {
  quickLinks?: { id: string; title: string; url: string }[];
  isLoading?: boolean;
}

function mockStore(overrides: StoreOverrides = {}) {
  const state = {
    quickLinks: overrides.quickLinks ?? [],
    isLoading: overrides.isLoading ?? false,
    initialize: vi.fn(),
    addQuickLink: vi.fn().mockResolvedValue(true),
    updateQuickLink: vi.fn().mockResolvedValue(true),
    removeQuickLink: vi.fn().mockResolvedValue(true),
  };
  vi.mocked(useQuickLinksStore).mockImplementation(createSelectorMock(state));
  return state;
}

describe('QuickLinksWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an add tile when there are no links', () => {
    mockStore({ quickLinks: [] });

    render(<QuickLinksWidget />);

    expect(screen.getByRole('button', { name: 'Add a quick link' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a tile per link plus the more button', () => {
    mockStore({
      quickLinks: [
        { id: '1', title: 'GitHub', url: 'https://github.com/' },
        { id: '2', title: 'Hacker News', url: 'https://news.ycombinator.com/' },
      ],
    });

    render(<QuickLinksWidget />);

    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hacker News' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More quick links' })).toBeInTheDocument();
  });

  it('opens link tiles in a new tab', () => {
    mockStore({ quickLinks: [{ id: '1', title: 'GitHub', url: 'https://github.com/' }] });

    render(<QuickLinksWidget />);

    const tile = screen.getByRole('link', { name: 'GitHub' });
    expect(tile).toHaveAttribute('target', '_blank');
    expect(tile).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('opens manager-list links in a new tab', () => {
    mockStore({ quickLinks: [{ id: '1', title: 'GitHub', url: 'https://github.com/' }] });

    render(<QuickLinksWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'More quick links' }));

    // Both the inline tile and the dropdown row share the link's accessible name.
    const links = screen.getAllByRole('link', { name: 'GitHub' });
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('submits a bare domain through the add form to addQuickLink', async () => {
    const state = mockStore({ quickLinks: [] });

    render(<QuickLinksWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a quick link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByPlaceholderText('example.com'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await vi.waitFor(() => {
      expect(state.addQuickLink).toHaveBeenCalledWith('', 'example.com');
    });
  });

  it('removes a link when its remove control is clicked', async () => {
    const state = mockStore({
      quickLinks: [{ id: '1', title: 'GitHub', url: 'https://github.com/' }],
    });

    render(<QuickLinksWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'More quick links' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await vi.waitFor(() => {
      expect(state.removeQuickLink).toHaveBeenCalledWith('1');
    });
  });
});
