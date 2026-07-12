import type React from 'react';

interface ConceptDueBadgeProps {
  count: number;
}

/** Small pill showing how many concept cards are due. Renders nothing at zero. */
export const ConceptDueBadge: React.FC<ConceptDueBadgeProps> = ({ count }) => {
  if (count <= 0) {
    return null;
  }

  const label = `${count} concept ${count === 1 ? 'card' : 'cards'} due`;

  return (
    <span
      role="img"
      aria-label={label}
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-semibold tabular-nums text-white"
    >
      {count}
    </span>
  );
};
