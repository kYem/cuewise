import * as React from 'react';

export interface StatCardProps {
  /** Lucide icon element — shown in a tinted chip, top-left. */
  icon?: React.ReactNode;
  /** The headline metric (string or number). */
  value: React.ReactNode;
  /** Metric name, e.g. "Current Streak". */
  label: React.ReactNode;
  /** Optional supporting line, e.g. "Longest: 1 days". */
  sublabel?: React.ReactNode;
  /** Colors the chip + value. @default 'primary' */
  tint?: 'primary' | 'success' | 'warning' | 'error';
  style?: React.CSSProperties;
}

/** Insights metric tile — tinted icon chip + big value + label. */
export function StatCard(props: StatCardProps): JSX.Element;
