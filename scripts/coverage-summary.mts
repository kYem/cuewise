#!/usr/bin/env -S node
/**
 * Coverage summary
 *
 * Prints a per-package coverage table from each workspace package's
 * coverage/coverage-summary.json, and appends it to $GITHUB_STEP_SUMMARY when set.
 * Fails if a package has a `test` script but no `test:coverage`: CI runs the
 * latter, so such a package's tests would silently stop running.
 *
 * Usage:
 *   pnpm exec turbo run test:coverage && node scripts/coverage-summary.mts
 */

import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Metric {
  pct: number;
}

interface Totals {
  lines: Metric;
  statements: Metric;
  functions: Metric;
  branches: Metric;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packageDirs = ['apps', 'packages'].flatMap((group) =>
  readdirSync(path.join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(group, entry.name))
    .filter((dir) => existsSync(path.join(root, dir, 'package.json')))
);

const rows: string[] = [];
const missingScript: string[] = [];

for (const dir of packageDirs) {
  const pkg = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
  const scripts: Record<string, string> = pkg.scripts ?? {};
  if (!scripts.test) {
    continue;
  }
  if (!scripts['test:coverage']) {
    missingScript.push(pkg.name);
    continue;
  }

  const summaryPath = path.join(root, dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    rows.push(`| ${pkg.name} | not run | | | |`);
    continue;
  }
  const { total } = JSON.parse(readFileSync(summaryPath, 'utf8')) as { total: Totals };
  const cells = [total.lines, total.statements, total.functions, total.branches].map(
    (metric) => `${metric.pct.toFixed(1)}%`
  );
  rows.push(`| ${pkg.name} | ${cells.join(' | ')} |`);
}

const table = [
  '## Test coverage',
  '',
  '| Package | Lines | Statements | Functions | Branches |',
  '| --- | --- | --- | --- | --- |',
  ...rows,
  '',
  '"not run" means the package was unaffected by this change, so Turbo skipped it.',
  '',
].join('\n');

console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
}

if (missingScript.length > 0) {
  console.error(
    `These packages have a "test" script but no "test:coverage", so CI never runs their tests: ${missingScript.join(', ')}`
  );
  process.exit(1);
}
