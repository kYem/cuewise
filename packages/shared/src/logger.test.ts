import { describe, expect, it } from 'vitest';
import { describeThrown } from './logger';

describe('describeThrown', () => {
  it('uses an Error message, not its stringification', () => {
    expect(describeThrown(new Error('storage down'))).toBe('storage down');
  });

  it('coerces a non-Error throw so the cause is still named', () => {
    expect(describeThrown('worker went away')).toBe('worker went away');
  });

  it('answers a sentinel for a value whose own coercion throws', () => {
    // A null-prototype object has no toString/Symbol.toPrimitive. Callers coerce inside catch
    // blocks, where a throw turns a handled failure into an unhandled one.
    expect(describeThrown(Object.create(null))).toBe('[unstringifiable value]');
  });
});
