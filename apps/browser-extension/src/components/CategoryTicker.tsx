import { Ticker, TickerUtils } from '@tombcato/smart-ticker';
import '@tombcato/smart-ticker/style.css';
import type React from 'react';

interface CategoryTickerProps {
  category: string;
  className?: string;
}

// Character lists for category name scrolling
const CATEGORY_CHARACTER_LISTS = [
  TickerUtils.provideAlphabeticalList(), // A-Za-z
  ' ', // Space for multi-word categories
];

/**
 * Animated category name display using smart-ticker.
 * Creates a slot-machine style animation when the category changes.
 */
export const CategoryTicker: React.FC<CategoryTickerProps> = ({ category, className }) => {
  // Capitalize first letter
  const displayCategory = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <span className={className}>
      <Ticker
        value={displayCategory}
        duration={600}
        easing="easeInOut"
        charWidth={0.6}
        characterLists={CATEGORY_CHARACTER_LISTS}
      />
    </span>
  );
};
