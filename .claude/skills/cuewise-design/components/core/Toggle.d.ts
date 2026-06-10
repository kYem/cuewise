import * as React from 'react';

export interface ToggleProps {
  /** On/off state. @default false */
  checked?: boolean;
  /** Called with the next boolean when clicked. */
  onChange?: (next: boolean) => void;
  /** @default 'md' */
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Pill switch — Settings toggles. Track goes violet when on. */
export function Toggle(props: ToggleProps): JSX.Element;
