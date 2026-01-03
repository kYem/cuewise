import { Ticker, TickerUtils } from '@tombcato/smart-ticker';
import '@tombcato/smart-ticker/style.css';
import type React from 'react';

interface AuthorTickerProps {
  author: string;
  className?: string;
}

// Character lists for author name scrolling
// Alphabetical list from TickerUtils + common punctuation and spaces
const AUTHOR_CHARACTER_LISTS = [
  TickerUtils.provideAlphabeticalList(), // A-Za-z
  TickerUtils.provideNumberList(), // 0-9 (for names like "Lao Tzu" or dates)
  ' .-\'",', // Space and common punctuation
];

/**
 * Animated author name display using smart-ticker.
 * Creates a slot-machine style animation when the author changes.
 */
export const AuthorTicker: React.FC<AuthorTickerProps> = ({ author, className }) => {
  return (
    <Ticker
      className={className}
      value={`— ${author}`}
      duration={600}
      easing="easeInOut"
      charWidth={0.6}
      characterLists={AUTHOR_CHARACTER_LISTS}
    />
  );
};
