import * as React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** A Lucide React icon element — auto-sized to the button. */
  icon: React.ReactNode;
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** 'surface' (frosted), 'primary' (violet), 'favorite' (heart toggle). @default 'surface' */
  variant?: 'surface' | 'primary' | 'favorite';
  /** Toggled state — for the 'favorite' variant fills the heart red. */
  active?: boolean;
}

/**
 * Circular, frosted icon button — floating nav, quote actions, timer controls.
 */
export function IconButton(props: IconButtonProps): JSX.Element;
