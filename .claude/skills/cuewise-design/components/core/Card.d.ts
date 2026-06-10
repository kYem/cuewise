import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Translucent surface + backdrop-blur (lets the gradient/photo show). @default false */
  frosted?: boolean;
  /** Inner padding. @default 'lg' */
  padding?: 'sm' | 'md' | 'lg' | 'xl';
  /** Corner radius. @default 'xl' (16px = the signature rounded-2xl) */
  radius?: 'lg' | 'xl' | '2xl';
  /** Lift + deepen shadow on hover. @default false */
  hover?: boolean;
}

/** Floating content panel — the core surface Cuewise builds screens from. */
export function Card(props: CardProps): JSX.Element;
