import React from 'react';

const LABELS = {
  inspiration: 'Inspiration', learning: 'Learning', productivity: 'Productivity',
  mindfulness: 'Mindfulness', success: 'Success', creativity: 'Creativity',
  resilience: 'Resilience', leadership: 'Leadership', health: 'Health', growth: 'Growth',
};

/**
 * Cuewise CategoryBadge — solid pill in the quote category's signature color.
 * Used above quotes, on quote cards and (smaller) inline.
 */
export function CategoryBadge({ category = 'inspiration', size = 'md', style = {}, children }) {
  const sizes = {
    sm: { fontSize: '0.6875rem', padding: '0.125rem 0.5rem' },
    md: { fontSize: '0.8125rem', padding: '0.25rem 0.75rem' },
    lg: { fontSize: '0.875rem', padding: '0.375rem 1rem' },
  };
  const s = sizes[size] || sizes.md;
  const label = children || LABELS[category] || category;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        lineHeight: 1.2,
        color: '#fff',
        backgroundColor: `var(--category-${category})`,
        borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-sm)',
        ...s,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
