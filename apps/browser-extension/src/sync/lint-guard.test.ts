import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `.biome/no-reentrant-envelope-queue.grit`, whose arms are a hand-maintained list. A
 * GritQL arm that matches nothing lints clean and enforces nothing — `$$$_` did exactly that and
 * shipped — so every arm is exercised, and the cases are read out of the rule rather than
 * duplicated here, which is what stops a new arm arriving untested.
 *
 * Lives here rather than beside the queue it guards: @cuewise/sync-engine is platform-agnostic by
 * rule, and this needs Node's child_process. This is also the host where reentrancy is reachable —
 * the SW answers 'details' outside its control-message mutex.
 */
const REPO_ROOT = resolve(__dirname, '../../../..');
const RULE_PATH = join(REPO_ROOT, '.biome/no-reentrant-envelope-queue.grit');
const BIOME = join(REPO_ROOT, 'node_modules/.bin/biome');

/** The `this.foo(...)` names the rule's `or` block forbids inside a queued operation. */
function guardedCalls(): string[] {
  const rule = readFileSync(RULE_PATH, 'utf8');
  const block = /contains or \{([^}]*)\}/s.exec(rule);
  if (block === null) {
    throw new Error('could not find the rule\'s "contains or" block');
  }
  const names = [...block[1].matchAll(/`this\.(\w+)\(/g)].map((match) => match[1]);
  if (names.length === 0) {
    throw new Error('the rule lists no guarded calls');
  }
  return names;
}

/** Lints a snippet through the real repo config, so the plugin actually runs, and reports hits. */
function deadlockDiagnostics(source: string): number {
  const dir = mkdtempSync(join(REPO_ROOT, 'packages/sync-engine/.lint-guard-'));
  try {
    const file = join(dir, 'fixture.ts');
    writeFileSync(file, source);
    try {
      execFileSync(BIOME, ['lint', file], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return 0;
    } catch (err) {
      // Biome prints the summary to stdout and the diagnostics themselves to stderr.
      const output = String((err as { stderr?: string }).stderr ?? '');
      return output.split('Deadlock:').length - 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function queuedOperationCalling(inner: string): string {
  // queueEnvelope declares itself, so a second stub for it would be a duplicate-member error and
  // drown the diagnostic under test.
  const stub = inner === 'queueEnvelope' ? '' : `  async ${inner}(): Promise<void> {}\n`;
  return `export class Probe {
  private queueEnvelope<T>(op: () => Promise<T>): Promise<T> {
    return op();
  }
${stub}  async offender(): Promise<void> {
    await this.queueEnvelope(async () => {
      await this.${inner}();
    });
  }
}
`;
}

describe('no-reentrant-envelope-queue lint rule', () => {
  it.each(guardedCalls())('flags a queued operation that calls this.%s', (inner) => {
    expect(deadlockDiagnostics(queuedOperationCalling(inner))).toBe(1);
  });

  it('leaves a queued operation that calls nothing guarded alone', () => {
    const clean = `export class Probe {
  private queueEnvelope<T>(op: () => Promise<T>): Promise<T> {
    return op();
  }
  async offender(): Promise<void> {
    await this.queueEnvelope(async () => {
      await Promise.resolve();
    });
  }
}
`;
    expect(deadlockDiagnostics(clean)).toBe(0);
  });
});
