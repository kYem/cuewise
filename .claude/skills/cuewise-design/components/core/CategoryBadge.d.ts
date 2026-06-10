import * as React from 'react';

export type QuoteCategory =
  | 'inspiration' | 'learning' | 'productivity' | 'mindfulness' | 'success'
  | 'creativity' | 'resilience' | 'leadership' | 'health' | 'growth';

export interface CategoryBadgeProps {
  /** One of the 10 quote categories — drives the pill color. @default 'inspiration' */
  category?: QuoteCategory;
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Override label text (defaults to the title-cased category). */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Solid color pill identifying a quote's category. */
export function CategoryBadge(props: CategoryBadgeProps): JSX.Element;
