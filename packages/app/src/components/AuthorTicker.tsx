import { Presets, Ticker } from '@tombcato/smart-ticker';
import '@tombcato/smart-ticker/style.css';
import type React from 'react';

interface AuthorTickerProps {
  author: string;
  className?: string;
}

// Character lists for author name scrolling
const AUTHOR_CHARACTER_LISTS = [
  Presets.ALPHABET,
  Presets.NUMBER,
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
