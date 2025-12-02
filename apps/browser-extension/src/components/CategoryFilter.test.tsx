import { ALL_QUOTE_CATEGORIES, QUOTE_CATEGORIES } from '@cuewise/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { CategoryFilter } from './CategoryFilter';

vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

interface MockCategoryFilterStore {
  enabledCategories: string[];
  showCustomQuotes: boolean;
  setEnabledCategories: Mock;
  toggleCategory: Mock;
  toggleCustomQuotes: Mock;
}

function createMockStore(
  overrides: Partial<MockCategoryFilterStore> = {}
): MockCategoryFilterStore {
  return {
    enabledCategories: [...ALL_QUOTE_CATEGORIES],
    showCustomQuotes: true,
    setEnabledCategories: vi.fn(),
    toggleCategory: vi.fn(),
    toggleCustomQuotes: vi.fn(),
    ...overrides,
  };
}

describe('CategoryFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render filter button with correct title when all enabled', () => {
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      expect(screen.getByTitle('Filter categories (11/11)')).toBeInTheDocument();
    });

    it('should render filter button with correct count when some disabled', () => {
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: ['inspiration', 'productivity'],
          showCustomQuotes: true,
        })
      );

      render(<CategoryFilter />);

      expect(screen.getByTitle('Filter categories (3/11)')).toBeInTheDocument();
    });

    it('should not show badge when all categories enabled', () => {
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      // Badge only shows when not all enabled - look for the count badge
      const badges = screen.queryAllByText(/^\d+$/);
      const badgeElements = badges.filter(
        (el) => el.className.includes('absolute') && el.className.includes('rounded-full')
      );
      expect(badgeElements).toHaveLength(0);
    });

    it('should show badge with count when some categories disabled', () => {
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: ['inspiration', 'productivity'],
          showCustomQuotes: false,
        })
      );

      render(<CategoryFilter />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should not show dropdown initially', () => {
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      expect(screen.queryByText('Filter Categories')).not.toBeInTheDocument();
    });
  });

  describe('dropdown behavior', () => {
    it('should open dropdown when filter button clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));

      expect(screen.getByText('Filter Categories')).toBeInTheDocument();
    });

    it('should close dropdown when close button clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));
      expect(screen.getByText('Filter Categories')).toBeInTheDocument();

      // Click the X button (it's the button with X icon in the header)
      const closeButton = screen.getByRole('button', { name: '' });
      await user.click(closeButton);

      expect(screen.queryByText('Filter Categories')).not.toBeInTheDocument();
    });

    it('should toggle dropdown when filter button clicked twice', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      const filterButton = screen.getByTitle('Filter categories (11/11)');

      await user.click(filterButton);
      expect(screen.getByText('Filter Categories')).toBeInTheDocument();

      await user.click(filterButton);
      expect(screen.queryByText('Filter Categories')).not.toBeInTheDocument();
    });

    it('should show all category options in dropdown', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));

      // Check Custom option
      expect(screen.getByText('Custom')).toBeInTheDocument();

      // Check all category options
      for (const category of ALL_QUOTE_CATEGORIES) {
        const displayName = QUOTE_CATEGORIES[category];
        expect(screen.getByText(displayName)).toBeInTheDocument();
      }
    });
  });

  describe('category toggling', () => {
    it('should call toggleCategory when category clicked', async () => {
      const user = userEvent.setup();
      const toggleCategory = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore({ toggleCategory }));

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));
      await user.click(screen.getByText('Inspiration'));

      expect(toggleCategory).toHaveBeenCalledWith('inspiration');
    });

    it('should call toggleCustomQuotes when custom option clicked', async () => {
      const user = userEvent.setup();
      const toggleCustomQuotes = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore({ toggleCustomQuotes }));

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));
      await user.click(screen.getByText('Custom'));

      expect(toggleCustomQuotes).toHaveBeenCalledTimes(1);
    });

    it('should call toggleCategory for each category', async () => {
      const user = userEvent.setup();
      const toggleCategory = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore({ toggleCategory }));

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));

      // Click a few different categories
      await user.click(screen.getByText('Productivity'));
      expect(toggleCategory).toHaveBeenCalledWith('productivity');

      await user.click(screen.getByText('Mindfulness'));
      expect(toggleCategory).toHaveBeenCalledWith('mindfulness');

      await user.click(screen.getByText('Success'));
      expect(toggleCategory).toHaveBeenCalledWith('success');

      expect(toggleCategory).toHaveBeenCalledTimes(3);
    });
  });

  describe('Select All / Clear All', () => {
    it('should call setEnabledCategories with all categories on Select All', async () => {
      const user = userEvent.setup();
      const setEnabledCategories = vi.fn();
      const toggleCustomQuotes = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: ['inspiration'],
          showCustomQuotes: false,
          setEnabledCategories,
          toggleCustomQuotes,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (1/11)'));
      await user.click(screen.getByText('Select All'));

      expect(setEnabledCategories).toHaveBeenCalledWith([...ALL_QUOTE_CATEGORIES]);
      expect(toggleCustomQuotes).toHaveBeenCalledTimes(1); // Called because showCustomQuotes was false
    });

    it('should not call toggleCustomQuotes on Select All if already enabled', async () => {
      const user = userEvent.setup();
      const setEnabledCategories = vi.fn();
      const toggleCustomQuotes = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: ['inspiration'],
          showCustomQuotes: true,
          setEnabledCategories,
          toggleCustomQuotes,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (2/11)'));
      await user.click(screen.getByText('Select All'));

      expect(setEnabledCategories).toHaveBeenCalledWith([...ALL_QUOTE_CATEGORIES]);
      expect(toggleCustomQuotes).not.toHaveBeenCalled();
    });

    it('should disable Select All button when all categories enabled', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(createMockStore());

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));

      const selectAllButton = screen.getByText('Select All');
      expect(selectAllButton).toBeDisabled();
    });

    it('should call setEnabledCategories with empty array on Clear All', async () => {
      const user = userEvent.setup();
      const setEnabledCategories = vi.fn();
      const toggleCustomQuotes = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          setEnabledCategories,
          toggleCustomQuotes,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (11/11)'));
      await user.click(screen.getByText('Clear All'));

      expect(setEnabledCategories).toHaveBeenCalledWith([]);
      expect(toggleCustomQuotes).toHaveBeenCalledTimes(1); // Called because showCustomQuotes was true
    });

    it('should not call toggleCustomQuotes on Clear All if already disabled', async () => {
      const user = userEvent.setup();
      const setEnabledCategories = vi.fn();
      const toggleCustomQuotes = vi.fn();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          showCustomQuotes: false,
          setEnabledCategories,
          toggleCustomQuotes,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (10/11)'));
      await user.click(screen.getByText('Clear All'));

      expect(setEnabledCategories).toHaveBeenCalledWith([]);
      expect(toggleCustomQuotes).not.toHaveBeenCalled();
    });

    it('should disable Clear All button when no categories enabled', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: [],
          showCustomQuotes: false,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (0/11)'));

      const clearAllButton = screen.getByText('Clear All');
      expect(clearAllButton).toBeDisabled();
    });
  });

  describe('warning state', () => {
    it('should show warning when no categories selected', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: [],
          showCustomQuotes: false,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (0/11)'));

      expect(screen.getByText(/No categories selected/)).toBeInTheDocument();
      expect(screen.getByText(/Select at least one to see quotes/)).toBeInTheDocument();
    });

    it('should not show warning when at least one category is enabled', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: ['inspiration'],
          showCustomQuotes: false,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (1/11)'));

      expect(screen.queryByText(/No categories selected/)).not.toBeInTheDocument();
    });

    it('should not show warning when only custom quotes enabled', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: [],
          showCustomQuotes: true,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (1/11)'));

      expect(screen.queryByText(/No categories selected/)).not.toBeInTheDocument();
    });
  });

  describe('checkbox visual state', () => {
    it('should show checkbox as checked for enabled categories', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: ['inspiration'],
          showCustomQuotes: false,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (1/11)'));

      // The Inspiration button should have a checked checkbox (bg-primary-600)
      const inspirationButton = screen.getByText('Inspiration').closest('button');
      expect(inspirationButton).toBeInTheDocument();

      // Check that the checkbox div has the checked styling
      const checkboxes = inspirationButton?.querySelectorAll('div');
      const checkboxDiv = checkboxes?.[0];
      expect(checkboxDiv?.className).toContain('bg-primary-600');
    });

    it('should show custom checkbox as checked when showCustomQuotes is true', async () => {
      const user = userEvent.setup();
      vi.mocked(useQuoteStore).mockReturnValue(
        createMockStore({
          enabledCategories: [],
          showCustomQuotes: true,
        })
      );

      render(<CategoryFilter />);

      await user.click(screen.getByTitle('Filter categories (1/11)'));

      const customButton = screen.getByText('Custom').closest('button');
      const checkboxDiv = customButton?.querySelector('div');
      expect(checkboxDiv?.className).toContain('bg-primary-600');
    });
  });
});
