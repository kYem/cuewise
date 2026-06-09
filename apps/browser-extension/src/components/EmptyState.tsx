import type React from 'react';
import { prefersReducedMotion } from '../utils/prefers-reduced-motion';
import { LottiePlayer } from './lottie/LottiePlayer';

interface EmptyStateProps {
  animationData: object;
  title: string;
  description?: string;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}

const SIZE_STYLES = {
  sm: {
    art: 'w-16 h-16 mb-2',
    title: 'text-sm text-secondary',
    description: 'text-xs text-tertiary',
  },
  md: {
    art: 'w-32 h-32 mb-3',
    title: 'text-lg text-secondary',
    description: 'text-sm text-tertiary',
  },
} as const;

/**
 * Reusable empty-state: a gently looping Lottie illustration with a title,
 * optional description, and optional actions. Under prefers-reduced-motion the
 * illustration shows a static frame instead of animating.
 */
export function EmptyState({
  animationData,
  title,
  description,
  size = 'md',
  children,
}: EmptyStateProps) {
  const styles = SIZE_STYLES[size];
  const animate = !prefersReducedMotion();

  return (
    <div className="flex flex-col items-center text-center">
      <LottiePlayer animationData={animationData} loop autoplay={animate} className={styles.art} />
      <p className={`${styles.title} mb-1`}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
