import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default 'primary' */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon — a Lucide React element; auto-sized to the button. */
  icon?: React.ReactNode;
  /** Trailing icon — a Lucide React element; auto-sized. */
  iconRight?: React.ReactNode;
  /** Corner radius. @default 'lg' (8px). Use 'full' for pill actions. */
  rounded?: 'lg' | 'xl' | 'full';
  /** @default false */
  fullWidth?: boolean;
}

/**
 * Primary action button for Cuewise. Pill-friendly, soft shadow, violet primary.
 *
 * @startingPoint section="Core" subtitle="Action button — primary/secondary/ghost/danger" viewport="700x120"
 */
export function Button(props: ButtonProps): JSX.Element;
