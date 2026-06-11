import type React from 'react';

interface GoalProgressRingProps {
  completed: number;
  total: number;
  size?: number;
}

/**
 * Compact ring summarizing today's goal completion, with the fraction centered.
 * Theme-agnostic: the fill uses the primary accent and the track a faint copy of
 * it, both via `currentColor`, so it reads correctly across all four themes.
 */
export const GoalProgressRing: React.FC<GoalProgressRingProps> = ({
  completed,
  total,
  size = 44,
}) => {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const center = size / 2;

  return (
    <span
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${completed} of ${total} goals completed`}
    >
      <svg width={size} height={size} className="block -rotate-90" aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          className="text-primary-600 opacity-20"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="text-primary-600 transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-xs font-bold tabular-nums text-primary">
        {completed}/{total}
      </span>
    </span>
  );
};
