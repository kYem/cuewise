export interface ComparisonRow {
  aspect: string;
  // Trusted, authored HTML so a cell can carry entities and links.
  them: string;
  us: string;
  winner?: 'them' | 'us';
}
